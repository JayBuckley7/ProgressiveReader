const { DOMParser } = require('xmldom');
const { parseManifest, parseSpine } = require('../../src/epubUtils');

describe('epub utils', () => {
  const xml = `
    <package>
      <manifest>
        <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="chap2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="chap1"/>
        <itemref idref="chap2"/>
      </spine>
    </package>`;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  test('parseManifest', () => {
    const manifest = parseManifest(doc);
    expect(manifest.chap1).toEqual({ id: 'chap1', href: 'chapter1.xhtml', mediaType: 'application/xhtml+xml' });
    expect(manifest.chap2).toEqual({ id: 'chap2', href: 'chapter2.xhtml', mediaType: 'application/xhtml+xml' });
  });

  test('parseSpine', () => {
    const manifest = parseManifest(doc);
    const spine = parseSpine(doc, manifest);
    expect(spine).toEqual([
      { id: 'chap1', href: 'chapter1.xhtml', mediaType: 'application/xhtml+xml', index: 0, linear: true },
      { id: 'chap2', href: 'chapter2.xhtml', mediaType: 'application/xhtml+xml', index: 1, linear: true }
    ]);
  });
});
