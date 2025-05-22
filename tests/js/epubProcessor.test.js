const { EpubProcessorWrapper } = require('../../app/static/js/epubProcessor');

test('loadBook rejects short buffers', async () => {
  const wrapper = new EpubProcessorWrapper();
  const result = await wrapper.loadBook(new ArrayBuffer(10));
  expect(result).toBe(false);
  expect(wrapper.isReady).toBe(false);
});

test('loadBook stores metadata and chapter count', async () => {
  const wrapper = new EpubProcessorWrapper();
  wrapper._createProcessor = () => ({
    ensureReady: () => Promise.resolve(),
    getMetadata: () => Promise.resolve({ title: 'Test Book' }),
    getTotalChapters: () => Promise.resolve(5)
  });

  const buffer = new ArrayBuffer(1024);
  const result = await wrapper.loadBook(buffer);
  expect(result).toBe(true);
  expect(wrapper.isReady).toBe(true);
  expect(wrapper.getBookTitle()).toBe('Test Book');
  expect(wrapper.getTotalChapters()).toBe(5);
});
