import org.jsoup.Jsoup
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse

class JpdbHighlighterTest {
    @Test
    fun noNestedRuby() {
        val html = "<p>こんにちは世界</p>"
        val doc = Jsoup.parseBodyFragment(html)
        val para = com.example.progressivereader.highlight.JpdbHighlighter.createParagraphFragments(doc.body())
        val tokens = listOf(
            com.example.progressivereader.highlight.Token(
                start = 0,
                end = 2,
                length = 2,
                card = com.example.progressivereader.highlight.Card(0,0, emptyList(), ""),
                rubies = listOf(com.example.progressivereader.highlight.Ruby("ru1",0,2,2))
            ),
            com.example.progressivereader.highlight.Token(
                start = 2,
                end = 5,
                length = 3,
                card = com.example.progressivereader.highlight.Card(0,0, emptyList(), ""),
                rubies = listOf(com.example.progressivereader.highlight.Ruby("ru2",2,5,3))
            )
        )
        com.example.progressivereader.highlight.JpdbHighlighter.applyTokens(para[0], tokens)
        val rubyCount = doc.select("ruby").size
        assertEquals(2, rubyCount)
        // ensure no ruby inside another ruby
        val nested = doc.select("ruby ruby").isNotEmpty()
        assertFalse(nested)
    }
}
