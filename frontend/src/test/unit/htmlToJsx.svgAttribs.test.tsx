import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";

describe("parseHtmlToJsx (SVG attributes)", () => {
  it("normalizes common SVG attribute names to React-compatible props", () => {
    const html =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewbox="0 0 10 10" preserveaspectratio="xMidYMid meet">' +
      '<use xlink:href="#a"></use>' +
      "</svg>";

    const tree = parseHtmlToJsx(html);

    const findFirst = (node: unknown, type: string): any | null => {
      if (!node) return null;
      if (Array.isArray(node)) {
        for (const c of node) {
          const hit = findFirst(c, type);
          if (hit) return hit;
        }
        return null;
      }
      if (typeof node === "object" && (node as any).type && (node as any).props) {
        const el = node as any;
        if (el.type === type) return el;
        return findFirst(el.props?.children, type);
      }
      return null;
    };

    const svg = findFirst(tree, "svg");
    expect(svg).toBeTruthy();
    expect(svg.props.viewBox).toBe("0 0 10 10");
    expect(svg.props.viewbox).toBeUndefined();
    expect(svg.props.preserveAspectRatio).toBe("xMidYMid meet");
    expect(svg.props.preserveaspectratio).toBeUndefined();
    expect(svg.props.xmlnsXlink).toBe("http://www.w3.org/1999/xlink");
    expect(svg.props["xmlns:xlink"]).toBeUndefined();

    const useEl = findFirst(svg, "use");
    expect(useEl).toBeTruthy();
    expect(useEl.props.xlinkHref).toBe("#a");
    expect(useEl.props["xlink:href"]).toBeUndefined();
  });
});
