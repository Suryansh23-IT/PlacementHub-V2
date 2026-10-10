export function semanticAiEnabled(config) {
  return config.NODE_ENV !== 'production' && config.AI_ENABLED === true
}
