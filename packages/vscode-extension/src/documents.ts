const LANGUAGE_EXTENSION: Readonly<Record<string, string>> = {
  astro: '.astro',
  c: '.c',
  cpp: '.cpp',
  csharp: '.cs',
  css: '.css',
  dart: '.dart',
  go: '.go',
  html: '.html',
  java: '.java',
  javascript: '.js',
  javascriptreact: '.jsx',
  json: '.json',
  jsonc: '.jsonc',
  kotlin: '.kt',
  less: '.less',
  lua: '.lua',
  markdown: '.md',
  mdx: '.mdx',
  php: '.php',
  plaintext: '.txt',
  python: '.py',
  r: '.r',
  ruby: '.rb',
  rust: '.rs',
  sass: '.sass',
  scala: '.scala',
  scss: '.scss',
  shellscript: '.sh',
  sql: '.sql',
  svelte: '.svelte',
  swift: '.swift',
  toml: '.toml',
  typescript: '.ts',
  typescriptreact: '.tsx',
  vue: '.vue',
  xml: '.xml',
  yaml: '.yaml',
};

/** Give untitled documents a supported virtual extension based on language mode. */
export function lintPath(fileName: string, languageId: string, untitled: boolean): string {
  if (!untitled) return fileName;
  const extension = LANGUAGE_EXTENSION[languageId];
  return extension ? `untitled${extension}` : fileName;
}
