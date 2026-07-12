export interface ElProps {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  onClick?: () => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) {
    node.className = props.className;
  }
  if (props.text !== undefined) {
    node.textContent = props.text;
  }
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  if (props.onClick !== undefined) {
    node.addEventListener('click', props.onClick);
  }
  node.append(...children);
  return node;
}

export function clearChildren(node: HTMLElement): void {
  node.replaceChildren();
}
