/// <reference types="svelte" />
declare module '*.svelte' {
  import { SvelteComponentTyped } from 'svelte';
  export default class Component extends SvelteComponentTyped<any, any, any> {}
}
