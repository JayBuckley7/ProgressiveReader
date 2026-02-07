package com.progressivereader.kmp.grammar

// Ported from web: frontend/src/features/grammar/data/grammarCatalog.ts

enum class GrammarLevel(val id: String) {
    N5("n5"),
    N4("n4"),
    N3("n3"),
    N2("n2"),
    N1("n1"),
}

enum class HintQuality {
    OK,
    TOO_COMMON,
}

data class GrammarPoint(
    val id: String, // "${level}:${title}"
    val level: GrammarLevel,
    val title: String,
    val meaning: String,
    val hints: List<String>,
    val hintQuality: HintQuality,
)

fun buildGrammarId(level: GrammarLevel, title: String): String = "${level.id}:$title"

private data class GrammarCard(val title: String, val meaning: String)

private val EXTREMELY_COMMON_HINTS: Set<String> =
    setOf(
        // Single-char particles are handled elsewhere; these are common multi-char forms.
        "です",
        "だ",
        "ます",
        "いる",
        "ある",
        "する",
        "なる",
        "こと",
        "もの",
    )

private val JAPANESE_CHAR_RE = Regex("[\\u3040-\\u30ff\\u3400-\\u9fff]")
private val KANJI_RE = Regex("[\\u3400-\\u9fff]")
private val STRIP_EDGES_RE = Regex("^[^\\u3040-\\u30ff\\u3400-\\u9fff]+|[^\\u3040-\\u30ff\\u3400-\\u9fff]+$")
private val BRACKETS_RE = Regex("\\s*\\[[^\\]]*\\]")
private val ASCII_PARENS_RE = Regex("\\([^)]*\\)")
private val JP_PARENS_RE = Regex("（[^）]*）")
private val PLACEHOLDERS_RE = Regex("\\bNoun\\b|\\bVerb\\b|\\bAdjective\\b", RegexOption.IGNORE_CASE)
private val SPLIT_RE = Regex("(?:\\s+|・|/|〜|～|~|\\+|-|…|\\.|,|:|;|\\(|\\)|\\[|\\]|\\{|\\})+")

fun buildHints(title: String): List<String> {
    var s = title.trim()

    // Remove trailing and inline [1], [2], etc.
    s = s.replace(BRACKETS_RE, " ")

    // Remove ascii parens e.g. "(ga)".
    s = s.replace(ASCII_PARENS_RE, " ")

    // Remove Japanese parens e.g. "（まえに）".
    s = s.replace(JP_PARENS_RE, " ")

    // Remove placeholders that show up in titles.
    s = s.replace(PLACEHOLDERS_RE, " ")

    val parts =
        s.split(SPLIT_RE)
            .map { it.trim() }
            .filter { it.isNotBlank() }

    val hints = mutableListOf<String>()
    val seen = HashSet<String>()

    for (raw in parts) {
        val hasJapanese = JAPANESE_CHAR_RE.containsMatchIn(raw)
        if (!hasJapanese) continue

        val cleaned = raw.replace(STRIP_EDGES_RE, "")
        if (cleaned.isBlank()) continue

        val hasKanji = KANJI_RE.containsMatchIn(cleaned)
        if (!hasKanji && cleaned.length < 2) continue

        if (!seen.add(cleaned)) continue
        hints.add(cleaned)
    }

    return hints
}

fun hintQualityForHints(hints: List<String>): HintQuality {
    if (hints.isEmpty()) return HintQuality.TOO_COMMON
    if (hints.all { it.length <= 1 }) return HintQuality.TOO_COMMON
    if (hints.all { EXTREMELY_COMMON_HINTS.contains(it) }) return HintQuality.TOO_COMMON
    return HintQuality.OK
}

private fun toPoint(level: GrammarLevel, card: GrammarCard): GrammarPoint {
    val hints = buildHints(card.title)
    return GrammarPoint(
        id = buildGrammarId(level, card.title),
        level = level,
        title = card.title,
        meaning = card.meaning,
        hints = hints,
        hintQuality = hintQualityForHints(hints),
    )
}

val GRAMMAR_LEVELS: List<GrammarLevel> =
    listOf(
        GrammarLevel.N5,
        GrammarLevel.N4,
        GrammarLevel.N3,
        GrammarLevel.N2,
        GrammarLevel.N1,
    )

private val N5_GRAMMAR: List<GrammarCard> =
    listOf(
        GrammarCard("ちゃいけない", "must not do (spoken Japanese)"),
        GrammarCard("じゃいけない", "must not do (spoken Japanese)"),
        GrammarCard("じゃだめ", "must not do (spoken Japanese)"),
        GrammarCard("です", "to be (am, is, are, were, used to)"),
        GrammarCard("だ", "to be (am, is, are, were, used to)"),
        GrammarCard("だから", "because"),
        GrammarCard("だけ", "only; just; as much as~"),
        GrammarCard("でしょう", "I think; it seems; probably; right?"),
        GrammarCard("だろう", "I think; it seems; probably; right?"),
        GrammarCard("で", "at, in"),
        GrammarCard("で [2]", "with, by"),
        GrammarCard("でも", "but; however; though~"),
        GrammarCard("どんな", "what kind of; what sort of"),
        GrammarCard("どうして", "why; for what reason; how"),
        GrammarCard("どうやって", "how; in what way; by what means"),
        GrammarCard("が (ga)", "subject marker"),
        GrammarCard("が", "but, however"),
        GrammarCard("があります", "there is; is (non-living things)"),
        GrammarCard("がいます", "there is; to be; is (living things)"),
        GrammarCard("がほしい", "to want something"),
        GrammarCard("ほうがいい", "had better; it'd be better to; should~"),
        GrammarCard("い adjectives", "i adjectives"),
        GrammarCard("一番（いちばん）", "the most; the best"),
        GrammarCard("一緒に（いっしょに）", "together"),
        GrammarCard("いつも", "always; usually; habitually"),
        GrammarCard("ではない", "to not be (am not; is not; are not)"),
        GrammarCard("じゃない", "to not be (am not; is not; are not)"),
        GrammarCard("か", "question particle"),
        GrammarCard("か～か", "or"),
        GrammarCard("から", "from"),
        GrammarCard("方（かた）", "the way of doing something; how to do"),
        GrammarCard("けど", "but; however; although~"),
        GrammarCard("けれども", "but; however; although~"),
        GrammarCard("Noun + くらい・ぐらい", "about, approximately"),
        GrammarCard("Noun + くらい・ぐらい [2]", "at least, at the very least"),
        GrammarCard("まだ", "still; not yet"),
        GrammarCard("まだ～ていません", "have not yet~"),
        GrammarCard("まで", "until; as far as; to (an extent); even~"),
        GrammarCard("前に（まえに）", "before; in front of~"),
        GrammarCard("ませんか", "would you; do you want to; shall we~"),
        GrammarCard("ましょう", "let's ~; shall we ~"),
        GrammarCard("ましょうか", "shall I ~; used to offer help to the listener"),
        GrammarCard("も", "too; also; as well; nor"),
        GrammarCard("もう", "again; another"),
        GrammarCard("もう [2]", "anymore; (no) longer"),
        GrammarCard("な adjectives", "na adjectives"),
        GrammarCard("な", "don’t do"),
        GrammarCard("なあ", "sentence ending particle; confirmation; admiration, etc."),
        GrammarCard("ないで", "without doing~; To do [B] without doing [A]"),
        GrammarCard("ないで [2]", "don't do"),
        GrammarCard("ないでください", "please don't do"),
        GrammarCard("ないといけない", "must do; have an obligation to do"),
        GrammarCard("なくてはいけない", "must do; need to do"),
        GrammarCard("なくてはならない", "must do; need to do"),
        GrammarCard("なくちゃ", "must do; need to; gotta do"),
        GrammarCard("なくてもいい", "don't have to"),
        GrammarCard("なる", "to become"),
        GrammarCard("のです", "to explain something; show emphasis"),
        GrammarCard("んです", "to explain something; show emphasis"),
        GrammarCard("ね", "isn't it? right? eh?"),
        GrammarCard("に", "destination particle; in; at; on; to"),
        GrammarCard("に [2]", "at (time/place)"),
        GrammarCard("に・へ", "to (indicates direction / destination)"),
        GrammarCard("に・へ [2]", "to (indicates direction / destination)"),
        GrammarCard("にいく", "go to do (verb)"),
        GrammarCard("にいく [2]", "go to do (noun)"),
        GrammarCard("にする", "to decide on"),
        GrammarCard("の", "possessive particle"),
        GrammarCard("の [2]", "verb nominalizer"),
        GrammarCard("のが下手（のがへた）", "to be bad at doing something"),
        GrammarCard("のが上手（のがじょうず）", "to be good at"),
        GrammarCard("のが好き（のがすき）", "to like doing something"),
        GrammarCard("ので", "because of; given that; since"),
        GrammarCard("お", "polite marker; honorific prefix particle"),
        GrammarCard("ご", "polite marker; honorific prefix particle"),
        GrammarCard("を", "object marker particle"),
        GrammarCard("をください", "please give me~"),
        GrammarCard("しかし", "but; however~"),
        GrammarCard("それから", "and; and then; after that; since then"),
        GrammarCard("そして", "and; and then; thus; and now~"),
        GrammarCard("すぎる", "too much"),
        GrammarCard("たことがある", "to have done something before"),
        GrammarCard("たことがない", "to have never done something before"),
        GrammarCard("たい", "want to do something"),
        GrammarCard("たり～たり", "do such things as A and B"),
        GrammarCard("たり", "do such things as A"),
        GrammarCard("てある", "is/has been done (resulting state)"),
        GrammarCard("ている", "ongoing action or current state"),
        GrammarCard("てから", "after doing~"),
        GrammarCard("てください", "please do"),
        GrammarCard("てはいけない", "must not; may not; cannot"),
        GrammarCard("てもいい・ていい", "is okay, is alright to, can, may"),
        GrammarCard("と", "and;"),
        GrammarCard("と [2]", "with"),
        GrammarCard("と [3]", "as"),
        GrammarCard("とき", "when; at this time"),
        GrammarCard("とても", "very; awfully; exceedingly"),
        GrammarCard("つもり", "plan to ~; intend to ~"),
        GrammarCard("は", "topic marker"),
        GrammarCard("は〜より...です", "[A] is more ~ than [B]"),
        GrammarCard("はどうですか", "how about; how is"),
        GrammarCard("や", "and; or; connecting particle"),
        GrammarCard("よ", "you know; emphasis (ending particle)"),
        GrammarCard("より～ほうが", "[A] is more than [B]"),
    )

private val N4_GRAMMAR: List<GrammarCard> =
    listOf(
        GrammarCard("間（あいだ）", "while; during; between"),
        GrammarCard("間に（あいだに）", "while/during~ something happened"),
        GrammarCard("あまり～ない", "not very, not much~"),
        GrammarCard("後で（あとで）", "after~; later"),
        GrammarCard("ば", "conditional form; If [A] then [B]"),
        GrammarCard("場合は（ばあいは）[1]", "in the event of; in the case that"),
        GrammarCard("場合は（ばあいは）[2]", "in the event of; in the case that"),
        GrammarCard("ばかり", "only; nothing but~"),
        GrammarCard("だけで [1]", "just by; just by doing"),
        GrammarCard("だけで [2]", "just by; just by doing"),
        GrammarCard("出す（だす）[1]", "to begin to; to start to; to burst into; ... out"),
        GrammarCard("出す（だす）[2]", "to begin to; to start to; to burst into; ... out"),
        GrammarCard("でございます", "to be (honorific である)"),
        GrammarCard("でも", "... or something; how about~"),
        GrammarCard("ではないか", "right?; isn't it?"),
        GrammarCard("が必要（がひつよう）[1]", "need; necessary"),
        GrammarCard("が必要（がひつよう）[2]", "need; necessary"),
        GrammarCard("がする [1]", "to smell; hear; taste"),
        GrammarCard("がする [2]", "to smell; hear; taste"),
        GrammarCard("がる・がっている", "to show signs of; to appear; to feel, to think"),
        GrammarCard("がり", "someone tends to; has a tendency to; has a sensitivity to~"),
        GrammarCard("ございます [1]", "to be, to exist (the polite form of ある)"),
        GrammarCard("ございます [2]", "to be, to exist (the polite form of ある)"),
        GrammarCard("始める（はじめる）[1]", "to start; to begin to~"),
        GrammarCard("始める（はじめる）[2]", "to start; to begin to~"),
        GrammarCard("はずだ", "it must be; it should be (expectation)"),
        GrammarCard("はずがない", "cannot be (impossible)"),
        GrammarCard("必要がある（ひつようがある）[1]", "need to; it is necessary to"),
        GrammarCard("必要がある（ひつようがある）[2]", "need to; it is necessary to"),
        GrammarCard("意向形（いこうけい）[1]", "volitional form; let's do~"),
        GrammarCard("意向形（いこうけい）[2]", "volitional form; let's do~"),
        GrammarCard("いらっしゃる", "to be; to come; to go (polite sonkeigo form of いる)"),
        GrammarCard("いたします [1]", "to do (polite form of する)"),
        GrammarCard("いたします [2]", "to do (polite form of する)"),
        GrammarCard("じゃないか [1]", "right? isn't it? let's~; confirmation"),
        GrammarCard("じゃないか [2]", "right? isn't it? let's~; confirmation"),
        GrammarCard("かどうか [1]", "whether or not~"),
        GrammarCard("かどうか [2]", "whether or not~"),
        GrammarCard("かしら", "I wonder~"),
        GrammarCard("かしら [2]", "I wonder~"),
        GrammarCard("かい", "turns a sentence into a yes/no question"),
        GrammarCard("かもしれない [1]", "might; perhaps; indicates possibility"),
        GrammarCard("かもしれない [2]", "might; perhaps; indicates possibility"),
        GrammarCard("かもしれない [3]", "might; perhaps; indicates possibility"),
        GrammarCard("かな", "I wonder; should I?"),
        GrammarCard("で・から作る（で・からつくる）", "made from; made with"),
        GrammarCard("きっと [1]", "surely; undoubtedly; almost certainly; most likely"),
        GrammarCard("きっと [2]", "surely; undoubtedly; almost certainly; most likely"),
        GrammarCard("頃（ころ ・ ごろ）[1]", "around; about; when"),
        GrammarCard("頃（ころ ・ ごろ）[2]", "around; about; when"),
        GrammarCard("こと", "Verb nominalizer"),
        GrammarCard("ことがある [1]", "there are times when ~; sometimes do ~"),
        GrammarCard("ことがある [2]", "there are times when ~; sometimes do ~"),
        GrammarCard("ことができる", "can; able to"),
        GrammarCard("ことになる [1]", "It has been decided that..; it turns out that.."),
        GrammarCard("ことになる [2]", "It has been decided that..; it turns out that.."),
        GrammarCard("ことにする [1]", "to decide on"),
        GrammarCard("ことにする [2]", "to decide on"),
        GrammarCard("くする", "to make something ~"),
        GrammarCard("にする", "to make something ~"),
        GrammarCard("急に（きゅうに）", "quickly; immediately; hastily; suddenly; abruptly; unexpectedly~"),
        GrammarCard("までに", "by; by the time; indicates time limit"),
        GrammarCard("まま [1]", "as it is; current state; without changing~"),
        GrammarCard("まま [2]", "as it is; current state; without changing~"),
        GrammarCard("または", "both; or; otherwise; choice between [A] or [B]"),
        GrammarCard("みたいだ", "like, similar to, resembling"),
        GrammarCard("みたいな", "like, similar to~ (used with nouns)"),
        GrammarCard("みたいに [1]", "like; similar to~ (used with verbs / adjective)"),
        GrammarCard("みたいに [2]", "like; similar to~ (used with verbs / adjective)"),
        GrammarCard("も", "as many as; as much as; up to; nearly~"),
        GrammarCard("な [1]", "don’t ~ (order somebody to not do something)"),
        GrammarCard("な [2]", "don’t ~ (order somebody to not do something)"),
        GrammarCard("など [1]", "such as, things like~"),
        GrammarCard("など [2]", "such as, things like~"),
        GrammarCard("ながら", "while; during; as; simultaneously"),
        GrammarCard("なかなか～ない", "not easy to; struggling to; not able to~"),
        GrammarCard("なかなか", "very; considerably; easily; readily; fairly; quite; highly; rather"),
        GrammarCard("なければいけない [1]", "must do something; have to do something"),
        GrammarCard("なければならない [2]", "must do something; have to do something"),
        GrammarCard("なら", "if; in the case that~"),
        GrammarCard("なさい", "do this (soft/firm command)"),
        GrammarCard("なさる", "to do (honorific)"),
        GrammarCard("に気がつく（にきがつく）[1]", "to notice; to realize"),
        GrammarCard("に気がつく（にきがつく）[2]", "to notice; to realize"),
        GrammarCard("にみえる [1]", "to look; to seem; to appear"),
        GrammarCard("にみえる [2]", "to look; to seem; to appear"),
        GrammarCard("にくい", "difficult to do~"),
        GrammarCard("の中で（のなかで）", "in; among~"),
        GrammarCard("のに [1]", "although, in spite of, even though~"),
        GrammarCard("のに [2]", "to (do something); in order to~"),
        GrammarCard("のは〜だ", "[A] is [B]; the reason for [A] is [B]"),
        GrammarCard("お～ください [1]", "please do (honorific)"),
        GrammarCard("お～ください [2]", "please do (honorific)"),
        GrammarCard("お～になる", "to do (honorific)"),
        GrammarCard("おきに [1]", "repeated at intervals, every~"),
        GrammarCard("おきに [2]", "repeated at intervals, every~"),
        GrammarCard("おる", "humble いる"),
        GrammarCard("終わる（おわる）", "to finish; to end~"),
        GrammarCard("られる", "potential form; ability or inability to do something"),
        GrammarCard("らしい [1]", "it seems like; I heard; apparently~"),
        GrammarCard("らしい [2]", "it seems like; I heard; apparently~"),
        GrammarCard("さ", "-ness; nominalizer for adjective"),
        GrammarCard("さっき [1]", "some time ago; just now"),
        GrammarCard("さっき [2]", "some time ago; just now"),
        GrammarCard("させる [1]", "causative form; to make/let somebody do something"),
        GrammarCard("させる [2]", "causative form; to make/let somebody do something"),
        GrammarCard("させる [3]", "causative form; to make/let somebody do something"),
        GrammarCard("させられる", "causative-passive; to be made to do something"),
        GrammarCard("させてください [2]", "please let me do"),
        GrammarCard("させてください [3]", "please let me do"),
        GrammarCard("さすが [1]", "as one would expect; as is to be expected; even~"),
        GrammarCard("さすが [2]", "as one would expect; as is to be expected; even~"),
        GrammarCard("し", "and; and what’s more; emphasis~"),
        GrammarCard("しか～ない [1]", "only, nothing but"),
        GrammarCard("しか～ない [2]", "only, nothing but"),
        GrammarCard("そんなに", "so much; so; like that"),
        GrammarCard("それでも", "but still; and yet; even so~"),
        GrammarCard("それに", "besides; in addition; also; moreover~"),
        GrammarCard("そうだ [1]", "I heard that; it is said that~"),
        GrammarCard("そうだ [2]", "I heard that; it is said that~"),
        GrammarCard("そうだ [3]", "looks like; appears like; seeming~"),
        GrammarCard("なさそうだ", "looks like; appears like; seeming ~ negative form NASASOU"),
        GrammarCard("そうに・そうな", "seems like; looks like~"),
        GrammarCard("たばかり", "just finished; something just occurred"),
        GrammarCard("たところ", "just finished doing, was just doing"),
        GrammarCard("他動詞・自動詞", "Transitive & Intransitive Verbs"),
        GrammarCard("たがる", "wants to do~ (third person)"),
        GrammarCard("たら [1]", "if; after; when~"),
        GrammarCard("たら [2]", "if; after; when~"),
        GrammarCard("たらどう", "why don't you (used to give advice)"),
        GrammarCard("たらいいですか・ばいいですか [1]", "what should I do?; speaker seeking instructions"),
        GrammarCard("たらいいですか・ばいいですか [2]", "what should I do?; speaker seeking instructions"),
        GrammarCard("て・で[1]", "conjunctive particle; so; because of [A], [B]..."),
        GrammarCard("て・で[2]", "conjunctive particle; so; because of [A], [B]..."),
        GrammarCard("てあげる", "to do for; to do a favor"),
        GrammarCard("てほしい", "I want you to; need you to~"),
        GrammarCard("ていく", "to start; to continue; to go on"),
        GrammarCard("ていた", "was doing something (past continuous)"),
        GrammarCard("ていただけませんか", "could you please~"),
        GrammarCard("てくれる", "to do a favor; do something for someone"),
        GrammarCard("てくる [1]", "to do… and come back; to become; to continue; to start~"),
        GrammarCard("てくる [2]", "to do… and come back; to become; to continue; to start~"),
        GrammarCard("てみる [1]", "try doing"),
        GrammarCard("てみる [2]", "try doing"),
        GrammarCard("てもらう [1]", "to get somebody to do something"),
        GrammarCard("てもらう [2]", "to get somebody to do something"),
        GrammarCard("てもらう [3]", "to get somebody to do something"),
        GrammarCard("ておく [1]", "to do something in advance"),
        GrammarCard("ておく [2]", "to do something in advance"),
        GrammarCard("てしまう・ちゃう", "to do something by accident, to finish completely"),
        GrammarCard("てすみません", "I’m sorry for"),
        GrammarCard("てやる [1]", "to do for; to do a favor (casual)"),
        GrammarCard("てやる [2]", "to do for; to do a favor (casual)"),
        GrammarCard("てよかった", "I’m glad that.."),
        GrammarCard("ているところ", "in the process of doing"),
        GrammarCard("ても・でも", "even; even if; even though~"),
        GrammarCard("と", "whenever [A] happens, [B] also happens"),
        GrammarCard("と言ってもいい（といってもいい）", "you could say; one might say; I'd say~"),
        GrammarCard("という [1]", "called; named; that~"),
        GrammarCard("という [2]", "called; named; that~"),
        GrammarCard("と言われている（といわれている）", "it is said that~"),
        GrammarCard("と聞いた（ときいた）", "I heard..."),
        GrammarCard("と思う（とおもう）[1]", "to think…; I think…; you think…"),
        GrammarCard("と思う（とおもう）[2]", "to think…; I think…; you think…"),
        GrammarCard("とか～とか", "among other things; such as; like~"),
        GrammarCard("ところ", "just about to; on the verge of doing something"),
        GrammarCard("続ける（つづける）", "continue to; keen on~"),
        GrammarCard("って [1]", "named; called~; casual quoting particle"),
        GrammarCard("って [2]", "named; called~; casual quoting particle"),
        GrammarCard("受身形（うけみけい）[1]", "passive form; passive voice"),
        GrammarCard("受身形（うけみけい）[2]", "passive form; passive voice"),
        GrammarCard("受身形（うけみけい）[3]", "passive form; passive voice"),
        GrammarCard("は〜が… は", "[A] but [B]; however; comparison"),
        GrammarCard("やすい", "easy to; likely to; prone to; have a tendency to~"),
        GrammarCard("やっと [1]", "at last; finally; barely; narrowly~"),
        GrammarCard("やっと [2]", "at last; finally; barely; narrowly~"),
        GrammarCard("より", "than; rather than; more than~"),
        GrammarCard("予定だ（よていだ）", "plan to; intend to"),
        GrammarCard("ようだ [1]", "appears; seems; looks as if~"),
        GrammarCard("ようだ [2]", "appears; seems; looks as if~"),
        GrammarCard("ように・ような [1]", "like; as; similar to~"),
        GrammarCard("ように・ような [2]", "like; as; similar to~"),
        GrammarCard("ように・ような [3]", "like; as; similar to~"),
        GrammarCard("ようになる [1]", "to reach the point that; to come to be that; to turn into~"),
        GrammarCard("ようになる [2]", "to reach the point that; to come to be that; to turn into~"),
        GrammarCard("ようにする", "to try to; to make sure that~"),
        GrammarCard("ようと思う（ようとおもう）", "thinking of doing; planning to~"),
        GrammarCard("ぜひ", "by all means; certainly; definitely~"),
        GrammarCard("全然～ない（ぜんぜん～ない）", "(not) at all"),
        GrammarCard("ぜんぜん", "wholly; entirely; completely; totally; extremely; very"),
        GrammarCard("づらい", "difficult to do~"),
    )

private val N3_GRAMMAR: List<GrammarCard> =
    listOf(
        GrammarCard("上げる（あげる）", "to finish doing ~"),
        GrammarCard("あまり", "so much… that"),
        GrammarCard("あまりにも", "too much; so much… that; excessively ~"),
        GrammarCard("合う（あう）", "do something together"),
        GrammarCard("ばいい", "should; can; it’d be good if ~"),
        GrammarCard("ばよかった", "should have; would have been better if ~"),
        GrammarCard("ば～ほど", "the more… the more ~"),
        GrammarCard("ば～のに", "would have; should have; if only ~"),
        GrammarCard("ばかりで", "only; just ~ (negative description)"),
        GrammarCard("ばかりでなく", "not only... but also; as well as ~"),
        GrammarCard("べきだ", "should do; must do ~"),
        GrammarCard("べきではない", "should not do; must not do ~"),
        GrammarCard("別に～ない（べつに～ない）", "not really, not particularly"),
        GrammarCard("ぶりに", "for the first time in (period of time)"),
        GrammarCard("中（ちゅう）", "currently; during; at some point; throughout; before the end of ~"),
        GrammarCard("だけ", "as much as ~"),
        GrammarCard("だけでなく", "not only… but also ~"),
        GrammarCard("だけど", "but; however; although; regarding ~"),
        GrammarCard("だらけ", "full of; covered with; a lot of (something undesirable)"),
        GrammarCard("どんなに～ても", "no matter how (much)"),
        GrammarCard("どうしても", "no matter what; at any cost; after all ~"),
        GrammarCard("ふりをする", "to pretend; to act as if ~"),
        GrammarCard("ふと", "suddenly; accidentally; unexpectedly; unintentionally ~"),
        GrammarCard("がち", "tend to; tendency to; frequently; often; to do something easily"),
        GrammarCard("がたい", "very difficult to; hard to ~"),
        GrammarCard("気味（ぎみ）", "-like; -looking; -looked; tending to ~"),
        GrammarCard("ごとに", "each; every; at intervals of ~"),
        GrammarCard("ほど", "degree; extent; bounds; upper limit"),
        GrammarCard("ほど～ない", "is not as… as ~"),
        GrammarCard("一度に（いちどに）", "all at once"),
        GrammarCard("いくら～ても", "no matter how ~"),
        GrammarCard("一方だ（いっぽうだ）", "more and more; continue to ~"),
        GrammarCard("一体（いったい）", "emphasis; what on earth; what in the world"),
        GrammarCard("じゃない", "maybe; most likely; confirmation of information; express surprise"),
        GrammarCard("か何か（かなにか）", "or something ~"),
        GrammarCard("かける", "half-; not yet finished; in the middle of~"),
        GrammarCard("から〜にかけて", "through; from [A] to [B]"),
        GrammarCard("代わりに（かわりに）", "instead of; as a substitute for; in exchange for; in return for"),
        GrammarCard("結果（けっか）", "as a result of; after ~"),
        GrammarCard("結局（けっきょく）", "after all; eventually; in the end ~"),
    )

private val N2_GRAMMAR: List<GrammarCard> =
    listOf(
        GrammarCard("あげく", "to end up; in the end; finally; after all ~"),
        GrammarCard("あるいは", "or; either; maybe; perhaps; possibly ~"),
        GrammarCard("ばかり", "about, approximately ~"),
        GrammarCard("ばかりだ", "continue to (go in negative direction)"),
        GrammarCard("ばかりか", "not only... but also; as well as ~"),
        GrammarCard("ばかりに", "simply because; on account of~ (negative result)"),
        GrammarCard("ちなみに", "by the way; in this connection; incidentally; (conjunction)"),
        GrammarCard("ちっとも～ない", "(not) at all; (not) in the least ~"),
        GrammarCard("だけあって", "being the case; precisely because; as expected from ~"),
        GrammarCard("だけましだ", "it’s better than; one should feel grateful for ~"),
        GrammarCard("だけに", "being the case; precisely because; as one would expect"),
        GrammarCard(
            "だけのことはある",
            "no wonder; as expected of; not ... for nothing; not ... with nothing to show for it",
        ),
        GrammarCard("だけは", "to do all that one can"),
        GrammarCard("だって", "because; but; after all; even; too"),
        GrammarCard("でしかない", "merely; nothing but; no more than; there is only ~"),
        GrammarCard("どころではない", "not the time for; not the place for; far from; anything but ~"),
        GrammarCard("どころか", "far from; anything but; let alone; not to mention; much less ~"),
        GrammarCard("どうやら", "possibly; apparently; seems like; somehow; barely ~"),
        GrammarCard("どうせ", "anyhow; in any case; at any rate; after all; no matter what"),
        GrammarCard("得ない（えない）", "unable to; cannot; it is not possible to ~"),
        GrammarCard("得る（える / うる）", "can; to be able to; is possible to ~"),
        GrammarCard("再び（ふたたび）", "again; once more"),
        GrammarCard("ふうに", "this way; that way; in such a way; how"),
        GrammarCard("がきっかけで / をきっかけに", "with… as a start; as a result of; taking advantage of ~"),
        GrammarCard("げ", "looks like; seems like; appears to ~"),
        GrammarCard("逆に（ぎゃくに）", "conversely; on the contrary ~"),
        GrammarCard("反面（はんめん）", "while, although; on the other hand~"),
        GrammarCard("果たして（はたして）", "as was expected; sure enough; really; actually ~"),
        GrammarCard("一応（いちおう）", "more or less; pretty much; roughly; tentatively ~"),
        GrammarCard("以外（いがい）", "with the exception of; excepting ~"),
        GrammarCard("以上に（いじょうに）", "more than; not less than; beyond ~"),
        GrammarCard("以上は（いじょうは）", "because; since; seeing that ~"),
        GrammarCard("いきなり", "abruptly; suddenly; all of a sudden; without warning"),
        GrammarCard(
            "一気に（いっきに）",
            "in one go; without stopping; all at once; immediately; instantly; right away ~",
        ),
        GrammarCard("一方で（いっぽうで）", "on one hand, on the other hand; although ~"),
        GrammarCard("いわゆる", "what is called; as it is called; the so-called; so to speak"),
        GrammarCard("いよいよ", "at last; finally; beyond doubt"),
        GrammarCard("上（じょう）", "for the sake of; from the standpoint of; as a matter of; in terms of ~"),
        GrammarCard("かのように", "as if; just like ~"),
        GrammarCard("かと思ったら（かとおもったら）", "just when; no sooner than ~"),
    )

private val N1_GRAMMAR: List<GrammarCard> =
    listOf(
        GrammarCard("敢えて（あえて）", "dare to; daringly; deliberately; purposely ~"),
        GrammarCard("あくまでも", "to the end; persistently; absolutely; is still very ~"),
        GrammarCard("案の定（あんのじょう）", "just as one thought; as usual; sure enough"),
        GrammarCard("あらかじめ", "beforehand; in advance; previously"),
        GrammarCard("あっての", "which can exist solely due to; which owes everything to"),
        GrammarCard("ばこそ", "only because ~"),
        GrammarCard("ばそれまでだ / たらそれまでだ", "if… then it’s over"),
        GrammarCard("べからず / べからざる", "must not; should not; do not ~"),
        GrammarCard("べく", "in order to; for the purpose of ~"),
        GrammarCard("べくもない", "cannot possibly be ~"),
        GrammarCard("べくして", "as it is bound to; following the natural course"),
        GrammarCard("びる / びて / びた", "to seem to be; to appear; to behave as ~"),
        GrammarCard("ぶり / っぷり", "style; manner; way"),
        GrammarCard("ぶる / ぶって / ぶった", "assuming the air of; behave like; pretend ~"),
        GrammarCard("だに / だにしない", "even; not even ~"),
        GrammarCard("だの～だの", "and; and the like; and so forth ~"),
        GrammarCard("だろうに", "surely..., but ~; should have; must have been ~"),
        GrammarCard("であれ / であろうと", "whoever; whatever; however; even ~"),
        GrammarCard("であれ～であれ", "whether [A] or [B]"),
        GrammarCard("でもあり～でもある", "to also be; both… and ~"),
        GrammarCard("でも何でもない / くも何ともない", "not in the least; nothing like that"),
        GrammarCard("でなくてなんだろう", "must be; is definitely ~"),
        GrammarCard("ではあるまいか", "isn't it; I wonder if it’s not ~"),
        GrammarCard("ではあるまいし", "it’s not like; it isn’t as if ~"),
        GrammarCard("では済まない（ではすまない）", "doesn’t end with just ~; more than ~"),
        GrammarCard("どうにも～ない", "not … by any means; cannot ~"),
        GrammarCard("が早いか（がはやいか）", "no sooner than; as soon as ~"),
        GrammarCard("が/も～なら、～も～だ", "negative connection/comparison (like father like son)"),
        GrammarCard("がましい", "look like; sound like; approximate; somewhat like ~"),
        GrammarCard("がてら", "while; on the same occasion; coincidentally ~"),
        GrammarCard("ごとき / ごとく / ごとし", "like; as if; the same as ~"),
        GrammarCard("ぐるみ", "together (with); -wide"),
        GrammarCard("羽目になる（はめになる）", "to get stuck with; to end up with ~"),
        GrammarCard("ほどのことではない", "it's not worth; no need to ~"),
        GrammarCard("ほうがましだ", "better than; would rather ~"),
        GrammarCard("放題（ほうだい）", "doing as one pleases; to one's heart's content"),
        GrammarCard("いかんだ / いかんでは / いかんによっては", "depending on; whether or not ~"),
        GrammarCard(
            "いかんにかかわらず / いかんによらず / いかんをとわず",
            "regardless of; whether or not ~",
        ),
        GrammarCard("いかなる", "any kind of; every; whatsoever; whatever"),
        GrammarCard("いかに", "how; in what way; how much; to what extent"),
    )

val GRAMMAR_CATALOG: Map<GrammarLevel, List<GrammarPoint>> =
    mapOf(
        GrammarLevel.N5 to N5_GRAMMAR.map { toPoint(GrammarLevel.N5, it) },
        GrammarLevel.N4 to N4_GRAMMAR.map { toPoint(GrammarLevel.N4, it) },
        GrammarLevel.N3 to N3_GRAMMAR.map { toPoint(GrammarLevel.N3, it) },
        GrammarLevel.N2 to N2_GRAMMAR.map { toPoint(GrammarLevel.N2, it) },
        GrammarLevel.N1 to N1_GRAMMAR.map { toPoint(GrammarLevel.N1, it) },
    )

private val grammarById: Map<String, GrammarPoint> by lazy {
    buildMap {
        for (level in GRAMMAR_LEVELS) {
            for (point in GRAMMAR_CATALOG[level].orEmpty()) {
                put(point.id, point)
            }
        }
    }
}

fun getGrammarPointById(id: String): GrammarPoint? = grammarById[id]

