declare module "@toast-ui/editor" {
  export default class Editor {
    constructor(options: Record<string, unknown>);
    getMarkdown(): string;
    destroy(): void;
  }
}
