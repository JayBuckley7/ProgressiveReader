// JSX type definitions
declare namespace JSX {
  interface IntrinsicElements {
    span: { class?: string; className?: string; [key: string]: any };
    ruby: { class?: string; className?: string; [key: string]: any };
    rt: { class?: string; className?: string; [key: string]: any };
    div: { class?: string; className?: string; [key: string]: any };
    button: { class?: string; className?: string; disabled?: boolean; type?: string; [key: string]: any };
    input: { class?: string; className?: string; type?: string; value?: any; checked?: boolean; [key: string]: any };
    style: { [key: string]: any };
    article: { [key: string]: any };
    section: { [key: string]: any };
    h2: { [key: string]: any };
    ol: { [key: string]: any };
    li: { [key: string]: any };
    a: { [key: string]: any };
  }
} 