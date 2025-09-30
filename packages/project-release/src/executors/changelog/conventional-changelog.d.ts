declare module 'conventional-changelog' {
  export class ConventionalChangelog {
    constructor(cwdOrGitClient?: string);
    loadPreset(preset: string): this;
    context(context: Record<string, unknown>): this;
    readPackage(): this;
    write(): AsyncGenerator<string, void>;
  }
}