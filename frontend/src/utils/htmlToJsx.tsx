import React from "react";
import { parseDocument, Element, Text, Node } from "htmlparser2";

export type HighlightFn = (text: string) => JSX.Element[];

/**
 * Convert HTML attributes to JSX-compatible attributes
 */
const convertAttribs = (attribs: Record<string, string>) => {
  const converted: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(attribs)) {
    // Convert 'class' to 'className' for JSX compatibility
    if (key === 'class') {
      converted.className = value;
    } else {
      converted[key] = value;
    }
  }
  
  return converted;
};

/**
 * Parse arbitrary HTML into a JSX tree. Optionally run a highlighting
 * function on text nodes.
 */
export function parseHtmlToJsx(html: string, highlightFn?: HighlightFn): JSX.Element {
  const dom = parseDocument(html);

  const convertNode = (node: Node, key: number): JSX.Element | string | null => {
    if (node.type === "text") {
      const textNode = node as Text;
      if (highlightFn) return <React.Fragment key={key}>{highlightFn(textNode.data)}</React.Fragment>;
      return textNode.data;
    }

    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      const el = node as Element;
      const children = (el.children || [])
        .map((child, i) => convertNode(child, i))
        .filter(Boolean);

      return React.createElement(
        el.name,
        { key, ...convertAttribs(el.attribs) },
        children.length > 0 ? children : null
      );
    }

    return null;
  };

  return <>{dom.children.map((node, i) => convertNode(node, i))}</>;
}
