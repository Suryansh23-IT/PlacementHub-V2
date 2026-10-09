export const A = { _id: '000000000000000000000001', name: 'Student A', role: 'student', isActive: true }
export const B = { _id: '000000000000000000000002', name: 'Student B', role: 'student', isActive: true }
export const C = { _id: '000000000000000000000003', name: 'Recruiter', role: 'company', isActive: true }
export const E = { _id: '000000000000000000000005', name: 'Other recruiter', role: 'company', isActive: true }
export const D = { _id: '000000000000000000000004', name: 'Admin', role: 'placement_admin', isActive: true }

export function fixture() {
  let serial = 10
  const matches = (row, query) => Object.entries(query).every(([key, value]) => key === '$nor' ? !value.some(q => matches(row, q)) : key === '$or' ? value.some(q => matches(row, q)) : key === '$and' ? value.every(q => matches(row, q)) : value?.$regex !== undefined ? new RegExp(value.$regex, value.$options).test(row[key] || '') : value?.$exists !== undefined ? (row[key] !== undefined) === value.$exists : value?.$in ? value.$in.map(String).includes(String(row[key])) : String(row[key]) === String(value))
  function model(initial = [], unique = false) {
    const rows = [...initial]
    return {
      rows,
      find(query) {
        let result = rows.filter(row => matches(row, query))
        const chain = { select() { return chain }, lean: async () => result, sort(order) { result.sort((a, b) => { for (const [key, dir] of Object.entries(order)) { if (a[key] > b[key]) return dir; if (a[key] < b[key]) return -dir } return 0 }); return chain }, skip(n) { result = result.slice(n); return chain }, limit(n) { result = result.slice(0, n); return chain }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) } }
        return chain
      },
      async create(input) {
        if (Array.isArray(input)) return Promise.all(input.map(item => this.create(item)))
        if (unique && rows.some(row => row.postId === input.postId && row.userId === input.userId)) throw Object.assign(new Error('duplicate'), { code: 11000 })
        const row = { _id: String(++serial).padStart(24, '0'), createdAt: new Date(serial * 1000), updatedAt: new Date(serial * 1000), ...input, async save() { this.updatedAt = new Date(this.updatedAt.getTime() + 1000); return this } }
        rows.push(row); return row
      },
      async updateMany(query, update) { let modifiedCount = 0; for (const row of rows) if (matches(row, query)) { Object.assign(row, update.$set); modifiedCount++ } return { modifiedCount } },
      async findOne(query) { return rows.find(row => matches(row, query)) ?? null },
      async findById(id) { return rows.find(row => String(row._id) === String(id)) ?? null },
      async countDocuments(query) { return rows.filter(row => matches(row, query)).length },
      async exists(query) { return rows.find(row => matches(row, query)) ?? null },
      async deleteOne(query) { const index = rows.findIndex(row => matches(row, query)); if (index >= 0) rows.splice(index, 1) },
      async deleteMany(query) { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], query)) rows.splice(i, 1) },
    }
  }
  return { socialProfileModel: model(), postModel: model(), likeModel: model([], true), commentModel: model(), notificationModel: model(), userModel: model([A, B, C, D, E]), profileModel: model([{ userId: A._id, branch: 'CSE' }]), companyModel: model([{ userId: C._id, companyName: 'Test Company' }, { userId: E._id, companyName: 'Other Company' }]) }
}

export const feedImage = { mimetype: 'image/png', buffer: Buffer.from('test image') }
export const feedDependencies = deps => ({ ...deps, imageFile: feedImage, storeImage: async file => file ? { filename: '00000000-0000-0000-0000-000000000000.png', mimeType: 'image/png', size: file.buffer.length } : undefined, removeImage: async () => {} })
