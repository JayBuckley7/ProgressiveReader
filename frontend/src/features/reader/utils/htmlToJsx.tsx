import React from "react";
import { parseDocument } from "htmlparser2";
import type { Element, Text, Node } from "domhandler";

export type HighlightFn = (text: string) => Array<React.ReactElement | string>;

// DOM "Name" production is broader than ASCII; we keep this conservative to avoid
// InvalidCharacterError crashes when React creates DOM nodes / sets attributes.
const VALID_DOM_NAME_RE = /^[A-Za-z_][0-9A-Za-z:._-]*$/;

function isValidDomName(name: string): boolean {
  const trimmed = name.trim();
  return Boolean(trimmed) && VALID_DOM_NAME_RE.test(trimmed);
}

/**
 * Convert a CSS inline style string into a React style object
 */
const cssStringToStyleObject = (styleText: string): React.CSSProperties => {
  const style: React.CSSProperties = {};
  // Split on semicolons, but keep values that might contain colons (split only on the first colon per rule)
  for (const rule of styleText.split(';')) {
    if (!rule) continue;
    const idx = rule.indexOf(':');
    if (idx === -1) continue;
    const rawProp = rule.slice(0, idx).trim();
    const rawVal = rule.slice(idx + 1).trim();
    if (!rawProp || !rawVal) continue;

    // CSS custom properties must remain `--kebab-case` for React to set them via style.setProperty.
    if (rawProp.startsWith('--')) {
      (style as any)[rawProp] = rawVal;
      continue;
    }

    // Convert kebab-case to camelCase for React
    let camelProp = rawProp.toLowerCase().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    // Vendor prefixes
    if (camelProp.startsWith('webkit')) camelProp = 'Webkit' + camelProp.slice(6);
    if (camelProp.startsWith('moz')) camelProp = 'Moz' + camelProp.slice(3);
    // 'ms' stays lowercase per React ('msOverflowStyle')
    if (camelProp.startsWith('o')) camelProp = 'O' + camelProp.slice(1);

    // Keep value as string to preserve units; React will handle it
    (style as any)[camelProp] = rawVal;
  }
  return style;
};

/**
 * Convert HTML attributes to JSX-compatible attributes
 */
const convertAttribs = (attribs: Record<string, string>) => {
  const converted: Record<string, any> = {};

  for (const [key, value] of Object.entries(attribs)) {
    if (!isValidDomName(key)) continue;

    const keyLower = key.toLowerCase();
    // Convert 'class' to 'className' for JSX compatibility
    if (keyLower === 'class') {
      converted.className = value;
      continue;
    }
    // Convert inline style strings to a React style object
    if (keyLower === 'style') {
      converted.style = cssStringToStyleObject(value);
      continue;
    }
    converted[key] = value;
  }

  return converted;
};

/**
 * Parse arbitrary HTML into a JSX tree. Optionally run a highlighting
 * function on text nodes.
 */
export function parseHtmlToJsx(html: string, highlightFn?: HighlightFn): React.ReactElement {
  const dom = parseDocument(html);

  const convertNode = (
    node: Node,
    key: number,
    inRawTextContainer: boolean
  ): React.ReactElement | string | null => {
    if (node.type === "text") {
      const textNode = node as Text;
      if (highlightFn && !inRawTextContainer) {
        return <React.Fragment key={key}>{highlightFn(textNode.data)}</React.Fragment>;
      }
      return textNode.data;
    }

    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      const el = node as Element;
      if (!isValidDomName(el.name)) {
        // Malformed HTML (often from translation output) can create invalid tag names like
        // "1abc" or "a b", which would crash the render with InvalidCharacterError.
        // Preserve the content by rendering children directly.
        const children = (el.children || [])
          .map((child: Node, i: number) => convertNode(child, i, inRawTextContainer))
          .filter((x): x is React.ReactElement | string => x !== null);
        return <React.Fragment key={key}>{children}</React.Fragment>;
      }

      const tagLower = el.name.toLowerCase();
      const nextInRawTextContainer =
        inRawTextContainer || tagLower === "script" || tagLower === "style";
      const children = (el.children || [])
        .map((child: Node, i: number) => convertNode(child, i, nextInRawTextContainer))
        .filter((x): x is React.ReactElement | string => x !== null);

      return React.createElement(
        el.name,
        { key, ...convertAttribs(el.attribs) },
        children.length > 0 ? children : null
      );
    }

    return null;
  };

  return <>{dom.children.map((node, i) => convertNode(node, i, false))}</>;
}
