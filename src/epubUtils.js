function parseManifest(opfDoc) {
    const items = {};
    const manifestElements = opfDoc.getElementsByTagName('item');
    for (let i = 0; i < manifestElements.length; i++) {
        const item = manifestElements[i];
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        const mediaType = item.getAttribute('media-type');
        items[id] = { id, href, mediaType };
    }
    return items;
}

function parseSpine(opfDoc, manifest) {
    const spineItems = [];
    const spineElements = opfDoc.getElementsByTagName('itemref');
    for (let i = 0; i < spineElements.length; i++) {
        const itemref = spineElements[i];
        const idref = itemref.getAttribute('idref');
        const linear = itemref.getAttribute('linear') !== 'no';
        if (manifest[idref]) {
            spineItems.push({
                id: idref,
                href: manifest[idref].href,
                mediaType: manifest[idref].mediaType,
                index: i,
                linear
            });
        }
    }
    return spineItems;
}

module.exports = { parseManifest, parseSpine };
