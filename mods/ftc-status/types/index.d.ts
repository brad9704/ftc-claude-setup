export type FtcText = string

declare module 'claude-code' {
  interface PluginState {
    'ftc-status': { text: FtcText }
  }
}
