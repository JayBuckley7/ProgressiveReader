const { JSDOM } = require('jsdom');

const { window } = new JSDOM(`<!DOCTYPE html><div id="content"></div>`);

global.window = window;
global.document = window.document;

require('../../app/static/js/jlptHighlighter.js');

test('removeJlptHighlights restores original content', () => {
  const content = document.getElementById('content');
  window.jlptHighlighter.initJlptHighlighter({
    contentAreaElement: content,
    trueOriginalServerContent: '<p>orig</p>'
  });

  content.innerHTML = '<span>highlighted</span>';
  window.jlptHighlighter.removeJlptHighlights();
  expect(content.innerHTML).toBe('<p>orig</p>');
});
