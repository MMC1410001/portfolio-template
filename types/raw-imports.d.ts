// Vite's `?raw` suffix imports a file's text as a string at build time.
// vite/client declares it too, but is not in tsconfig `types`, and pulling
// the whole of it in to type one suffix would widen import.meta for every file.
declare module '*.md?raw' {
  const text: string;
  export default text;
}
