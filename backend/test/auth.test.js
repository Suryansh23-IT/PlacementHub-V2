import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const testRunId = randomUUID()
const testPassword = `test-password-${testRunId}`
const testEmail = (label) => `${label}-${testRunId}@example.test`

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = `${randomUUID()}${randomUUID()}`
process.env.ADMIN_BOOTSTRAP_SECRET = `${randomUUID()}${randomUUID()}`
process.env.CLIENT_URL = 'http://localhost:5173'

const { env } = await import('../src/config/env.js')
const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { registerUser, loginUser } = await import('../src/modules/auth/auth.service.js')
const { authorizeRoles, createAuthenticate } = await import('../src/modules/auth/auth.middleware.js')
const { app } = await import('../src/app.js')

function createUserModel(users = []) {
  return {
    async exists(query) {
      return users.some((user) => Object.entries(query).every(([key, value]) => user[key] === value)) ? { _id: 'existing' } : null
    },
    async create(input) {
      const user = { _id: `user-${users.length + 1}`, isActive: true, ...input }
      users.push(user)
      return user
    },
    findOne({ email }) {
      return { select: async () => users.find((user) => user.email === email) ?? null }
    },
    findById(id) {
      return { select: async () => users.find((user) => user._id === id) ?? null }
    },
  }
}

function invoke(middleware, request) {
  return new Promise((resolve) => middleware(request, {}, (error) => resolve(error)))
}

test('registerUser hashes the password and returns a JWT without password data', async () => {
  const users = []
  const result = await registerUser({ name: 'Asha Kumar', email: testEmail('student'), password: testPassword, role: USER_ROLES.STUDENT }, { userModel: createUserModel(users) })

  assert.equal(users.length, 1)
  assert.notEqual(users[0].passwordHash, testPassword)
  assert.equal(await bcrypt.compare(testPassword, users[0].passwordHash), true)
  assert.deepEqual(Object.keys(result.user).sort(), ['email', 'id', 'name', 'role'])
  assert.equal(jwt.verify(result.accessToken, env.JWT_SECRET).sub, result.user.id)
})

test('registerUser rejects duplicate email and unauthorized Placement Admin registration', async () => {
  const email = testEmail('duplicate')
  const users = [{ _id: 'student-1', email, role: USER_ROLES.STUDENT }]
  await assert.rejects(
    registerUser({ name: 'Asha Kumar', email, password: testPassword, role: USER_ROLES.STUDENT }, { userModel: createUserModel(users) }),
    { errorCode: 'CONFLICT' },
  )
  await assert.rejects(
    registerUser({ name: 'Admin User', email: testEmail('unauthorized-admin'), password: testPassword, role: USER_ROLES.PLACEMENT_ADMIN }, { userModel: createUserModel([]) }),
    { errorCode: 'FORBIDDEN' },
  )
})

test('registerUser converts a database uniqueness race into a conflict response', async () => {
  const model = createUserModel([])
  model.create = async () => {
    const error = new Error('duplicate key')
    error.code = 11000
    throw error
  }
  await assert.rejects(
    registerUser({ name: 'Asha Kumar', email: testEmail('race'), password: testPassword, role: USER_ROLES.STUDENT }, { userModel: model }),
    { errorCode: 'CONFLICT' },
  )
})

test('Placement Admin bootstrap is secret-gated and limited to one account', async () => {
  const users = []
  const model = createUserModel(users)
  const input = { name: 'Admin User', email: testEmail('admin'), password: testPassword, role: USER_ROLES.PLACEMENT_ADMIN, adminBootstrapSecret: env.ADMIN_BOOTSTRAP_SECRET }
  const result = await registerUser(input, { userModel: model })
  assert.equal(result.user.role, USER_ROLES.PLACEMENT_ADMIN)
  await assert.rejects(registerUser({ ...input, email: testEmail('second-admin') }, { userModel: model }), { errorCode: 'CONFLICT' })
})

test('loginUser accepts a valid password and rejects invalid or inactive accounts', async () => {
  const passwordHash = await bcrypt.hash(testPassword, env.BCRYPT_SALT_ROUNDS)
  const email = testEmail('login')
  const model = createUserModel([{ _id: 'user-1', name: 'Asha Kumar', email, passwordHash, role: USER_ROLES.STUDENT, isActive: true }])
  const result = await loginUser({ email, password: testPassword }, { userModel: model })
  assert.equal(result.user.email, email)
  await assert.rejects(loginUser({ email, password: `${testPassword}-wrong` }, { userModel: model }), { errorCode: 'UNAUTHENTICATED' })
  const inactiveEmail = testEmail('inactive')
  const inactiveModel = createUserModel([{ _id: 'user-2', name: 'Inactive User', email: inactiveEmail, passwordHash, role: USER_ROLES.STUDENT, isActive: false }])
  await assert.rejects(loginUser({ email: inactiveEmail, password: testPassword }, { userModel: inactiveModel }), { errorCode: 'FORBIDDEN' })
})

test('authentication and role middleware enforce valid active users and allowed roles', async () => {
  const user = { _id: 'admin-1', name: 'Admin', email: testEmail('middleware-admin'), role: USER_ROLES.PLACEMENT_ADMIN, isActive: true }
  const token = jwt.sign({ role: USER_ROLES.PLACEMENT_ADMIN }, env.JWT_SECRET, { subject: user._id, expiresIn: '1h' })
  const request = { headers: { authorization: `Bearer ${token}` } }
  const authenticate = createAuthenticate({ userModel: createUserModel([user]) })
  assert.equal(await invoke(authenticate, request), undefined)
  assert.equal(request.user.role, USER_ROLES.PLACEMENT_ADMIN)
  assert.equal(await invoke(authorizeRoles(USER_ROLES.PLACEMENT_ADMIN), request), undefined)
  const forbidden = await invoke(authorizeRoles(USER_ROLES.COMPANY), request)
  assert.equal(forbidden.errorCode, 'FORBIDDEN')
  const missingToken = await invoke(authenticate, { headers: {} })
  assert.equal(missingToken.errorCode, 'UNAUTHENTICATED')
})

test('auth routes reject invalid input and protect the current-user route', async () => {
  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const invalid = await fetch(`${baseUrl}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email' }) })
    assert.equal(invalid.status, 422)
    assert.equal((await invalid.json()).errorCode, 'VALIDATION_ERROR')
    const protectedRoute = await fetch(`${baseUrl}/api/v1/auth/me`)
    assert.equal(protectedRoute.status, 401)
    assert.equal((await protectedRoute.json()).errorCode, 'UNAUTHENTICATED')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
