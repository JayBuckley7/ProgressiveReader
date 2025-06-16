package com.example.progressivereader.highlight

import org.json.JSONObject

/** Data classes mirroring the structures used in the frontend TypeScript code. */
data class Ruby(
    val text: String?,
    val start: Int,
    val end: Int,
    val length: Int
)

data class Card(
    val vid: Int,
    val sid: Int,
    val state: List<String>,
    val spelling: String
)

data class Token(
    val start: Int,
    val end: Int,
    val length: Int,
    val card: Card,
    val rubies: List<Ruby>
) {
    companion object {
        fun fromJson(obj: JSONObject): Token {
            val cardObj = obj.getJSONObject("card")
            val card = Card(
                vid = cardObj.getInt("vid"),
                sid = cardObj.getInt("sid"),
                state = cardObj.getJSONArray("state").let { ja -> List(ja.length()) { ja.getString(it) } },
                spelling = cardObj.getString("spelling")
            )
            val rubiesArr = obj.getJSONArray("rubies")
            val rubies = List(rubiesArr.length()) { idx ->
                val r = rubiesArr.getJSONObject(idx)
                Ruby(r.optString("text"), r.getInt("start"), r.getInt("end"), r.getInt("length"))
            }
            return Token(
                start = obj.getInt("start"),
                end = obj.getInt("end"),
                length = obj.getInt("length"),
                card = card,
                rubies = rubies
            )
        }
    }
}

/** Simple fragment used when applying JPDB tokens to HTML */
data class Fragment(
    var start: Int,
    var end: Int,
    var length: Int,
    val node: org.jsoup.nodes.TextNode,
    var hasRuby: Boolean
)

typealias Paragraph = MutableList<Fragment>
