import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bookMetadataService } from "@features/books/services/bookMetadata";
import { useUser } from "@clerk/clerk-react";

type GrammarCard = {
  title: string;
  meaning: string;
};

const N5_GRAMMAR: GrammarCard[] = [
  { title: "ちゃいけない", meaning: "must not do (spoken Japanese)" },
  { title: "じゃいけない", meaning: "must not do (spoken Japanese)" },
  { title: "じゃだめ", meaning: "must not do (spoken Japanese)" },
  { title: "です", meaning: "to be (am, is, are, were, used to)" },
  { title: "だ", meaning: "to be (am, is, are, were, used to)" },
  { title: "だから", meaning: "because" },
  { title: "だけ", meaning: "only; just; as much as~" },
  { title: "でしょう", meaning: "I think; it seems; probably; right?" },
  { title: "だろう", meaning: "I think; it seems; probably; right?" },
  { title: "で", meaning: "at, in" },
  { title: "で [2]", meaning: "with, by" },
  { title: "でも", meaning: "but; however; though~" },
  { title: "どんな", meaning: "what kind of; what sort of" },
  { title: "どうして", meaning: "why; for what reason; how" },
  { title: "どうやって", meaning: "how; in what way; by what means" },
  { title: "が (ga)", meaning: "subject marker" },
  { title: "が", meaning: "but, however" },
  { title: "があります", meaning: "there is; is (non-living things)" },
  { title: "がいます", meaning: "there is; to be; is (living things)" },
  { title: "がほしい", meaning: "to want something" },
  { title: "ほうがいい", meaning: "had better; it'd be better to; should~" },
  { title: "い adjectives", meaning: "i adjectives" },
  { title: "一番（いちばん）", meaning: "the most; the best" },
  { title: "一緒に（いっしょに）", meaning: "together" },
  { title: "いつも", meaning: "always; usually; habitually" },
  { title: "ではない", meaning: "to not be (am not; is not; are not)" },
  { title: "じゃない", meaning: "to not be (am not; is not; are not)" },
  { title: "か", meaning: "question particle" },
  { title: "か～か", meaning: "or" },
  { title: "から", meaning: "from" },
  { title: "方（かた）", meaning: "the way of doing something; how to do" },
  { title: "けど", meaning: "but; however; although~" },
  { title: "けれども", meaning: "but; however; although~" },
  { title: "Noun + くらい・ぐらい", meaning: "about, approximately" },
  { title: "Noun + くらい・ぐらい [2]", meaning: "at least, at the very least" },
  { title: "まだ", meaning: "still; not yet" },
  { title: "まだ～ていません", meaning: "have not yet~" },
  { title: "まで", meaning: "until; as far as; to (an extent); even~" },
  { title: "前に（まえに）", meaning: "before; in front of~" },
  { title: "ませんか", meaning: "would you; do you want to; shall we~" },
  { title: "ましょう", meaning: "let's ~; shall we ~" },
  { title: "ましょうか", meaning: "shall I ~; used to offer help to the listener" },
  { title: "も", meaning: "too; also; as well; nor" },
  { title: "もう", meaning: "again; another" },
  { title: "もう [2]", meaning: "anymore; (no) longer" },
  { title: "な adjectives", meaning: "na adjectives" },
  { title: "な", meaning: "don’t do" },
  { title: "なあ", meaning: "sentence ending particle; confirmation; admiration, etc." },
  { title: "ないで", meaning: "without doing~; To do [B] without doing [A]" },
  { title: "ないで [2]", meaning: "don't do" },
  { title: "ないでください", meaning: "please don't do" },
  { title: "ないといけない", meaning: "must do; have an obligation to do" },
  { title: "なくてはいけない", meaning: "must do; need to do" },
  { title: "なくてはならない", meaning: "must do; need to do" },
  { title: "なくちゃ", meaning: "must do; need to; gotta do" },
  { title: "なくてもいい", meaning: "don't have to" },
  { title: "なる", meaning: "to become" },
  { title: "のです", meaning: "to explain something; show emphasis" },
  { title: "んです", meaning: "to explain something; show emphasis" },
  { title: "ね", meaning: "isn't it? right? eh?" },
  { title: "に", meaning: "destination particle; in; at; on; to" },
  { title: "に [2]", meaning: "at (time/place)" },
  { title: "に・へ", meaning: "to (indicates direction / destination)" },
  { title: "に・へ [2]", meaning: "to (indicates direction / destination)" },
  { title: "にいく", meaning: "go to do (verb)" },
  { title: "にいく [2]", meaning: "go to do (noun)" },
  { title: "にする", meaning: "to decide on" },
  { title: "の", meaning: "possessive particle" },
  { title: "の [2]", meaning: "verb nominalizer" },
  { title: "のが下手（のがへた）", meaning: "to be bad at doing something" },
  { title: "のが上手（のがじょうず）", meaning: "to be good at" },
  { title: "のが好き（のがすき）", meaning: "to like doing something" },
  { title: "ので", meaning: "because of; given that; since" },
  { title: "お", meaning: "polite marker; honorific prefix particle" },
  { title: "ご", meaning: "polite marker; honorific prefix particle" },
  { title: "を", meaning: "object marker particle" },
  { title: "をください", meaning: "please give me~" },
  { title: "しかし", meaning: "but; however~" },
  { title: "それから", meaning: "and; and then; after that; since then" },
  { title: "そして", meaning: "and; and then; thus; and now~" },
  { title: "すぎる", meaning: "too much" },
  { title: "たことがある", meaning: "to have done something before" },
  { title: "たことがない", meaning: "to have never done something before" },
  { title: "たい", meaning: "want to do something" },
  { title: "たり～たり", meaning: "do such things as A and B" },
  { title: "たり", meaning: "do such things as A" },
  { title: "てある", meaning: "is/has been done (resulting state)" },
  { title: "ている", meaning: "ongoing action or current state" },
  { title: "てから", meaning: "after doing~" },
  { title: "てください", meaning: "please do" },
  { title: "てはいけない", meaning: "must not; may not; cannot" },
  { title: "てもいい・ていい", meaning: "is okay, is alright to, can, may" },
  { title: "と", meaning: "and;" },
  { title: "と [2]", meaning: "with" },
  { title: "と [3]", meaning: "as" },
  { title: "とき", meaning: "when; at this time" },
  { title: "とても", meaning: "very; awfully; exceedingly" },
  { title: "つもり", meaning: "plan to ~; intend to ~" },
  { title: "は", meaning: "topic marker" },
  { title: "は〜より...です", meaning: "[A] is more ~ than [B]" },
  { title: "はどうですか", meaning: "how about; how is" },
  { title: "や", meaning: "and; or; connecting particle" },
  { title: "よ", meaning: "you know; emphasis (ending particle)" },
  { title: "より～ほうが", meaning: "[A] is more than [B]" },
];

const N4_GRAMMAR: GrammarCard[] = [
  { title: "間（あいだ）", meaning: "while; during; between" },
  { title: "間に（あいだに）", meaning: "while/during~ something happened" },
  { title: "あまり～ない", meaning: "not very, not much~" },
  { title: "後で（あとで）", meaning: "after~; later" },
  { title: "ば", meaning: "conditional form; If [A] then [B]" },
  { title: "場合は（ばあいは）[1]", meaning: "in the event of; in the case that" },
  { title: "場合は（ばあいは）[2]", meaning: "in the event of; in the case that" },
  { title: "ばかり", meaning: "only; nothing but~" },
  { title: "だけで [1]", meaning: "just by; just by doing" },
  { title: "だけで [2]", meaning: "just by; just by doing" },
  { title: "出す（だす）[1]", meaning: "to begin to; to start to; to burst into; ... out" },
  { title: "出す（だす）[2]", meaning: "to begin to; to start to; to burst into; ... out" },
  { title: "でございます", meaning: "to be (honorific である)" },
  { title: "でも", meaning: "... or something; how about~" },
  { title: "ではないか", meaning: "right?; isn't it?" },
  { title: "が必要（がひつよう）[1]", meaning: "need; necessary" },
  { title: "が必要（がひつよう）[2]", meaning: "need; necessary" },
  { title: "がする [1]", meaning: "to smell; hear; taste" },
  { title: "がする [2]", meaning: "to smell; hear; taste" },
  { title: "がる・がっている", meaning: "to show signs of; to appear; to feel, to think" },
  { title: "がり", meaning: "someone tends to; has a tendency to; has a sensitivity to~" },
  { title: "ございます [1]", meaning: "to be, to exist (the polite form of ある)" },
  { title: "ございます [2]", meaning: "to be, to exist (the polite form of ある)" },
  { title: "始める（はじめる）[1]", meaning: "to start; to begin to~" },
  { title: "始める（はじめる）[2]", meaning: "to start; to begin to~" },
  { title: "はずだ", meaning: "it must be; it should be (expectation)" },
  { title: "はずがない", meaning: "cannot be (impossible)" },
  { title: "必要がある（ひつようがある）[1]", meaning: "need to; it is necessary to" },
  { title: "必要がある（ひつようがある）[2]", meaning: "need to; it is necessary to" },
  { title: "意向形（いこうけい）[1]", meaning: "volitional form; let's do~" },
  { title: "意向形（いこうけい）[2]", meaning: "volitional form; let's do~" },
  { title: "いらっしゃる", meaning: "to be; to come; to go (polite sonkeigo form of いる)" },
  { title: "いたします [1]", meaning: "to do (polite form of する)" },
  { title: "いたします [2]", meaning: "to do (polite form of する)" },
  { title: "じゃないか [1]", meaning: "right? isn't it? let's~; confirmation" },
  { title: "じゃないか [2]", meaning: "right? isn't it? let's~; confirmation" },
  { title: "かどうか [1]", meaning: "whether or not~" },
  { title: "かどうか [2]", meaning: "whether or not~" },
  { title: "かしら", meaning: "I wonder~" },
  { title: "かしら [2]", meaning: "I wonder~" },
  { title: "かい", meaning: "turns a sentence into a yes/no question" },
  { title: "かもしれない [1]", meaning: "might; perhaps; indicates possibility" },
  { title: "かもしれない [2]", meaning: "might; perhaps; indicates possibility" },
  { title: "かもしれない [3]", meaning: "might; perhaps; indicates possibility" },
  { title: "かな", meaning: "I wonder; should I?" },
  { title: "で・から作る（で・からつくる）", meaning: "made from; made with" },
  { title: "きっと [1]", meaning: "surely; undoubtedly; almost certainly; most likely" },
  { title: "きっと [2]", meaning: "surely; undoubtedly; almost certainly; most likely" },
  { title: "頃（ころ ・ ごろ）[1]", meaning: "around; about; when" },
  { title: "頃（ころ ・ ごろ）[2]", meaning: "around; about; when" },
  { title: "こと", meaning: "Verb nominalizer" },
  { title: "ことがある [1]", meaning: "there are times when ~; sometimes do ~" },
  { title: "ことがある [2]", meaning: "there are times when ~; sometimes do ~" },
  { title: "ことができる", meaning: "can; able to" },
  { title: "ことになる [1]", meaning: "It has been decided that..; it turns out that.." },
  { title: "ことになる [2]", meaning: "It has been decided that..; it turns out that.." },
  { title: "ことにする [1]", meaning: "to decide on" },
  { title: "ことにする [2]", meaning: "to decide on" },
  { title: "くする", meaning: "to make something ~" },
  { title: "にする", meaning: "to make something ~" },
  { title: "急に（きゅうに）", meaning: "quickly; immediately; hastily; suddenly; abruptly; unexpectedly~" },
  { title: "までに", meaning: "by; by the time; indicates time limit" },
  { title: "まま [1]", meaning: "as it is; current state; without changing~" },
  { title: "まま [2]", meaning: "as it is; current state; without changing~" },
  { title: "または", meaning: "both; or; otherwise; choice between [A] or [B]" },
  { title: "みたいだ", meaning: "like, similar to, resembling" },
  { title: "みたいな", meaning: "like, similar to~ (used with nouns)" },
  { title: "みたいに [1]", meaning: "like; similar to~ (used with verbs / adjective)" },
  { title: "みたいに [2]", meaning: "like; similar to~ (used with verbs / adjective)" },
  { title: "も", meaning: "as many as; as much as; up to; nearly~" },
  { title: "な [1]", meaning: "don’t ~ (order somebody to not do something)" },
  { title: "な [2]", meaning: "don’t ~ (order somebody to not do something)" },
  { title: "など [1]", meaning: "such as, things like~" },
  { title: "など [2]", meaning: "such as, things like~" },
  { title: "ながら", meaning: "while; during; as; simultaneously" },
  { title: "なかなか～ない", meaning: "not easy to; struggling to; not able to~" },
  { title: "なかなか", meaning: "very; considerably; easily; readily; fairly; quite; highly; rather" },
  { title: "なければいけない [1]", meaning: "must do something; have to do something" },
  { title: "なければならない [2]", meaning: "must do something; have to do something" },
  { title: "なら", meaning: "if; in the case that~" },
  { title: "なさい", meaning: "do this (soft/firm command)" },
  { title: "なさる", meaning: "to do (honorific)" },
  { title: "に気がつく（にきがつく）[1]", meaning: "to notice; to realize" },
  { title: "に気がつく（にきがつく）[2]", meaning: "to notice; to realize" },
  { title: "にみえる [1]", meaning: "to look; to seem; to appear" },
  { title: "にみえる [2]", meaning: "to look; to seem; to appear" },
  { title: "にくい", meaning: "difficult to do~" },
  { title: "の中で（のなかで）", meaning: "in; among~" },
  { title: "のに [1]", meaning: "although, in spite of, even though~" },
  { title: "のに [2]", meaning: "to (do something); in order to~" },
  { title: "のは〜だ", meaning: "[A] is [B]; the reason for [A] is [B]" },
  { title: "お～ください [1]", meaning: "please do (honorific)" },
  { title: "お～ください [2]", meaning: "please do (honorific)" },
  { title: "お～になる", meaning: "to do (honorific)" },
  { title: "おきに [1]", meaning: "repeated at intervals, every~" },
  { title: "おきに [2]", meaning: "repeated at intervals, every~" },
  { title: "おる", meaning: "humble いる" },
  { title: "終わる（おわる）", meaning: "to finish; to end~" },
  { title: "られる", meaning: "potential form; ability or inability to do something" },
  { title: "らしい [1]", meaning: "it seems like; I heard; apparently~" },
  { title: "らしい [2]", meaning: "it seems like; I heard; apparently~" },
  { title: "さ", meaning: "-ness; nominalizer for adjective" },
  { title: "さっき [1]", meaning: "some time ago; just now" },
  { title: "さっき [2]", meaning: "some time ago; just now" },
  { title: "させる [1]", meaning: "causative form; to make/let somebody do something" },
  { title: "させる [2]", meaning: "causative form; to make/let somebody do something" },
  { title: "させる [3]", meaning: "causative form; to make/let somebody do something" },
  { title: "させられる", meaning: "causative-passive; to be made to do something" },
  { title: "させてください [2]", meaning: "please let me do" },
  { title: "させてください [3]", meaning: "please let me do" },
  { title: "さすが [1]", meaning: "as one would expect; as is to be expected; even~" },
  { title: "さすが [2]", meaning: "as one would expect; as is to be expected; even~" },
  { title: "し", meaning: "and; and what’s more; emphasis~" },
  { title: "しか～ない [1]", meaning: "only, nothing but" },
  { title: "しか～ない [2]", meaning: "only, nothing but" },
  { title: "そんなに", meaning: "so much; so; like that" },
  { title: "それでも", meaning: "but still; and yet; even so~" },
  { title: "それに", meaning: "besides; in addition; also; moreover~" },
  { title: "そうだ [1]", meaning: "I heard that; it is said that~" },
  { title: "そうだ [2]", meaning: "I heard that; it is said that~" },
  { title: "そうだ [3]", meaning: "looks like; appears like; seeming~" },
  { title: "なさそうだ", meaning: "looks like; appears like; seeming ~ negative form NASASOU" },
  { title: "そうに・そうな", meaning: "seems like; looks like~" },
  { title: "たばかり", meaning: "just finished; something just occurred" },
  { title: "たところ", meaning: "just finished doing, was just doing" },
  { title: "他動詞・自動詞", meaning: "Transitive & Intransitive Verbs" },
  { title: "たがる", meaning: "wants to do~ (third person)" },
  { title: "たら [1]", meaning: "if; after; when~" },
  { title: "たら [2]", meaning: "if; after; when~" },
  { title: "たらどう", meaning: "why don't you (used to give advice)" },
  { title: "たらいいですか・ばいいですか [1]", meaning: "what should I do?; speaker seeking instructions" },
  { title: "たらいいですか・ばいいですか [2]", meaning: "what should I do?; speaker seeking instructions" },
  { title: "て・で[1]", meaning: "conjunctive particle; so; because of [A], [B]..." },
  { title: "て・で[2]", meaning: "conjunctive particle; so; because of [A], [B]..." },
  { title: "てあげる", meaning: "to do for; to do a favor" },
  { title: "てほしい", meaning: "I want you to; need you to~" },
  { title: "ていく", meaning: "to start; to continue; to go on" },
  { title: "ていた", meaning: "was doing something (past continuous)" },
  { title: "ていただけませんか", meaning: "could you please~" },
  { title: "てくれる", meaning: "to do a favor; do something for someone" },
  { title: "てくる [1]", meaning: "to do… and come back; to become; to continue; to start~" },
  { title: "てくる [2]", meaning: "to do… and come back; to become; to continue; to start~" },
  { title: "てみる [1]", meaning: "try doing" },
  { title: "てみる [2]", meaning: "try doing" },
  { title: "てもらう [1]", meaning: "to get somebody to do something" },
  { title: "てもらう [2]", meaning: "to get somebody to do something" },
  { title: "てもらう [3]", meaning: "to get somebody to do something" },
  { title: "ておく [1]", meaning: "to do something in advance" },
  { title: "ておく [2]", meaning: "to do something in advance" },
  { title: "てしまう・ちゃう", meaning: "to do something by accident, to finish completely" },
  { title: "てすみません", meaning: "I’m sorry for" },
  { title: "てやる [1]", meaning: "to do for; to do a favor (casual)" },
  { title: "てやる [2]", meaning: "to do for; to do a favor (casual)" },
  { title: "てよかった", meaning: "I’m glad that.." },
  { title: "ているところ", meaning: "in the process of doing" },
  { title: "ても・でも", meaning: "even; even if; even though~" },
  { title: "と", meaning: "whenever [A] happens, [B] also happens" },
  { title: "と言ってもいい（といってもいい）", meaning: "you could say; one might say; I'd say~" },
  { title: "という [1]", meaning: "called; named; that~" },
  { title: "という [2]", meaning: "called; named; that~" },
  { title: "と言われている（といわれている）", meaning: "it is said that~" },
  { title: "と聞いた（ときいた）", meaning: "I heard..." },
  { title: "と思う（とおもう）[1]", meaning: "to think…; I think…; you think…" },
  { title: "と思う（とおもう）[2]", meaning: "to think…; I think…; you think…" },
  { title: "とか～とか", meaning: "among other things; such as; like~" },
  { title: "ところ", meaning: "just about to; on the verge of doing something" },
  { title: "続ける（つづける）", meaning: "continue to; keen on~" },
  { title: "って [1]", meaning: "named; called~; casual quoting particle" },
  { title: "って [2]", meaning: "named; called~; casual quoting particle" },
  { title: "受身形（うけみけい）[1]", meaning: "passive form; passive voice" },
  { title: "受身形（うけみけい）[2]", meaning: "passive form; passive voice" },
  { title: "受身形（うけみけい）[3]", meaning: "passive form; passive voice" },
  { title: "は〜が… は", meaning: "[A] but [B]; however; comparison" },
  { title: "やすい", meaning: "easy to; likely to; prone to; have a tendency to~" },
  { title: "やっと [1]", meaning: "at last; finally; barely; narrowly~" },
  { title: "やっと [2]", meaning: "at last; finally; barely; narrowly~" },
  { title: "より", meaning: "than; rather than; more than~" },
  { title: "予定だ（よていだ）", meaning: "plan to; intend to" },
  { title: "ようだ [1]", meaning: "appears; seems; looks as if~" },
  { title: "ようだ [2]", meaning: "appears; seems; looks as if~" },
  { title: "ように・ような [1]", meaning: "like; as; similar to~" },
  { title: "ように・ような [2]", meaning: "like; as; similar to~" },
  { title: "ように・ような [3]", meaning: "like; as; similar to~" },
  { title: "ようになる [1]", meaning: "to reach the point that; to come to be that; to turn into~" },
  { title: "ようになる [2]", meaning: "to reach the point that; to come to be that; to turn into~" },
  { title: "ようにする", meaning: "to try to; to make sure that~" },
  { title: "ようと思う（ようとおもう）", meaning: "thinking of doing; planning to~" },
  { title: "ぜひ", meaning: "by all means; certainly; definitely~" },
  { title: "全然～ない（ぜんぜん～ない）", meaning: "(not) at all" },
  { title: "ぜんぜん", meaning: "wholly; entirely; completely; totally; extremely; very" },
  { title: "づらい", meaning: "difficult to do~" },
];

const N3_GRAMMAR: GrammarCard[] = [
  { title: "上げる（あげる）", meaning: "to finish doing ~" },
  { title: "あまり", meaning: "so much… that" },
  { title: "あまりにも", meaning: "too much; so much… that; excessively ~" },
  { title: "合う（あう）", meaning: "do something together" },
  { title: "ばいい", meaning: "should; can; it’d be good if ~" },
  { title: "ばよかった", meaning: "should have; would have been better if ~" },
  { title: "ば～ほど", meaning: "the more… the more ~" },
  { title: "ば～のに", meaning: "would have; should have; if only ~" },
  { title: "ばかりで", meaning: "only; just ~ (negative description)" },
  { title: "ばかりでなく", meaning: "not only... but also; as well as ~" },
  { title: "べきだ", meaning: "should do; must do ~" },
  { title: "べきではない", meaning: "should not do; must not do ~" },
  { title: "別に～ない（べつに～ない）", meaning: "not really, not particularly" },
  { title: "ぶりに", meaning: "for the first time in (period of time)" },
  { title: "中（ちゅう）", meaning: "currently; during; at some point; throughout; before the end of ~" },
  { title: "だけ", meaning: "as much as ~" },
  { title: "だけでなく", meaning: "not only… but also ~" },
  { title: "だけど", meaning: "but; however; although; regarding ~" },
  { title: "だらけ", meaning: "full of; covered with; a lot of (something undesirable)" },
  { title: "どんなに～ても", meaning: "no matter how (much)" },
  { title: "どうしても", meaning: "no matter what; at any cost; after all ~" },
  { title: "ふりをする", meaning: "to pretend; to act as if ~" },
  { title: "ふと", meaning: "suddenly; accidentally; unexpectedly; unintentionally ~" },
  { title: "がち", meaning: "tend to; tendency to; frequently; often; to do something easily" },
  { title: "がたい", meaning: "very difficult to; hard to ~" },
  { title: "気味（ぎみ）", meaning: "-like; -looking; -looked; tending to ~" },
  { title: "ごとに", meaning: "each; every; at intervals of ~" },
  { title: "ほど", meaning: "degree; extent; bounds; upper limit" },
  { title: "ほど～ない", meaning: "is not as… as ~" },
  { title: "一度に（いちどに）", meaning: "all at once" },
  { title: "いくら～ても", meaning: "no matter how ~" },
  { title: "一方だ（いっぽうだ）", meaning: "more and more; continue to ~" },
  { title: "一体（いったい）", meaning: "emphasis; what on earth; what in the world" },
  { title: "じゃない", meaning: "maybe; most likely; confirmation of information; express surprise" },
  { title: "か何か（かなにか）", meaning: "or something ~" },
  { title: "かける", meaning: "half-; not yet finished; in the middle of~" },
  { title: "から〜にかけて", meaning: "through; from [A] to [B]" },
  { title: "代わりに（かわりに）", meaning: "instead of; as a substitute for; in exchange for; in return for" },
  { title: "結果（けっか）", meaning: "as a result of; after ~" },
  { title: "結局（けっきょく）", meaning: "after all; eventually; in the end ~" },
];

const N2_GRAMMAR: GrammarCard[] = [
  { title: "あげく", meaning: "to end up; in the end; finally; after all ~" },
  { title: "あるいは", meaning: "or; either; maybe; perhaps; possibly ~" },
  { title: "ばかり", meaning: "about, approximately ~" },
  { title: "ばかりだ", meaning: "continue to (go in negative direction)" },
  { title: "ばかりか", meaning: "not only... but also; as well as ~" },
  { title: "ばかりに", meaning: "simply because; on account of~ (negative result)" },
  { title: "ちなみに", meaning: "by the way; in this connection; incidentally; (conjunction)" },
  { title: "ちっとも～ない", meaning: "(not) at all; (not) in the least ~" },
  { title: "だけあって", meaning: "being the case; precisely because; as expected from ~" },
  { title: "だけましだ", meaning: "it’s better than; one should feel grateful for ~" },
  { title: "だけに", meaning: "being the case; precisely because; as one would expect" },
  { title: "だけのことはある", meaning: "no wonder; as expected of; not ... for nothing; not ... with nothing to show for it" },
  { title: "だけは", meaning: "to do all that one can" },
  { title: "だって", meaning: "because; but; after all; even; too" },
  { title: "でしかない", meaning: "merely; nothing but; no more than; there is only ~" },
  { title: "どころではない", meaning: "not the time for; not the place for; far from; anything but ~" },
  { title: "どころか", meaning: "far from; anything but; let alone; not to mention; much less ~" },
  { title: "どうやら", meaning: "possibly; apparently; seems like; somehow; barely ~" },
  { title: "どうせ", meaning: "anyhow; in any case; at any rate; after all; no matter what" },
  { title: "得ない（えない）", meaning: "unable to; cannot; it is not possible to ~" },
  { title: "得る（える / うる）", meaning: "can; to be able to; is possible to ~" },
  { title: "再び（ふたたび）", meaning: "again; once more" },
  { title: "ふうに", meaning: "this way; that way; in such a way; how" },
  { title: "がきっかけで / をきっかけに", meaning: "with… as a start; as a result of; taking advantage of ~" },
  { title: "げ", meaning: "looks like; seems like; appears to ~" },
  { title: "逆に（ぎゃくに）", meaning: "conversely; on the contrary ~" },
  { title: "反面（はんめん）", meaning: "while, although; on the other hand~" },
  { title: "果たして（はたして）", meaning: "as was expected; sure enough; really; actually ~" },
  { title: "一応（いちおう）", meaning: "more or less; pretty much; roughly; tentatively ~" },
  { title: "以外（いがい）", meaning: "with the exception of; excepting ~" },
  { title: "以上に（いじょうに）", meaning: "more than; not less than; beyond ~" },
  { title: "以上は（いじょうは）", meaning: "because; since; seeing that ~" },
  { title: "いきなり", meaning: "abruptly; suddenly; all of a sudden; without warning" },
  { title: "一気に（いっきに）", meaning: "in one go; without stopping; all at once; immediately; instantly; right away ~" },
  { title: "一方で（いっぽうで）", meaning: "on one hand, on the other hand; although ~" },
  { title: "いわゆる", meaning: "what is called; as it is called; the so-called; so to speak" },
  { title: "いよいよ", meaning: "at last; finally; beyond doubt" },
  { title: "上（じょう）", meaning: "for the sake of; from the standpoint of; as a matter of; in terms of ~" },
  { title: "かのように", meaning: "as if; just like ~" },
  { title: "かと思ったら（かとおもったら）", meaning: "just when; no sooner than ~" },
];

const N1_GRAMMAR: GrammarCard[] = [
  { title: "敢えて（あえて）", meaning: "dare to; daringly; deliberately; purposely ~" },
  { title: "あくまでも", meaning: "to the end; persistently; absolutely; is still very ~" },
  { title: "案の定（あんのじょう）", meaning: "just as one thought; as usual; sure enough" },
  { title: "あらかじめ", meaning: "beforehand; in advance; previously" },
  { title: "あっての", meaning: "which can exist solely due to; which owes everything to" },
  { title: "ばこそ", meaning: "only because ~" },
  { title: "ばそれまでだ / たらそれまでだ", meaning: "if… then it’s over" },
  { title: "べからず / べからざる", meaning: "must not; should not; do not ~" },
  { title: "べく", meaning: "in order to; for the purpose of ~" },
  { title: "べくもない", meaning: "cannot possibly be ~" },
  { title: "べくして", meaning: "as it is bound to; following the natural course" },
  { title: "びる / びて / びた", meaning: "to seem to be; to appear; to behave as ~" },
  { title: "ぶり / っぷり", meaning: "style; manner; way" },
  { title: "ぶる / ぶって / ぶった", meaning: "assuming the air of; behave like; pretend ~" },
  { title: "だに / だにしない", meaning: "even; not even ~" },
  { title: "だの～だの", meaning: "and; and the like; and so forth ~" },
  { title: "だろうに", meaning: "surely..., but ~; should have; must have been ~" },
  { title: "であれ / であろうと", meaning: "whoever; whatever; however; even ~" },
  { title: "であれ～であれ", meaning: "whether [A] or [B]" },
  { title: "でもあり～でもある", meaning: "to also be; both… and ~" },
  { title: "でも何でもない / くも何ともない", meaning: "not in the least; nothing like that" },
  { title: "でなくてなんだろう", meaning: "must be; is definitely ~" },
  { title: "ではあるまいか", meaning: "isn't it; I wonder if it’s not ~" },
  { title: "ではあるまいし", meaning: "it’s not like; it isn’t as if ~" },
  { title: "では済まない（ではすまない）", meaning: "doesn’t end with just ~; more than ~" },
  { title: "どうにも～ない", meaning: "not … by any means; cannot ~" },
  { title: "が早いか（がはやいか）", meaning: "no sooner than; as soon as ~" },
  { title: "が/も～なら、～も～だ", meaning: "negative connection/comparison (like father like son)" },
  { title: "がましい", meaning: "look like; sound like; approximate; somewhat like ~" },
  { title: "がてら", meaning: "while; on the same occasion; coincidentally ~" },
  { title: "ごとき / ごとく / ごとし", meaning: "like; as if; the same as ~" },
  { title: "ぐるみ", meaning: "together (with); -wide" },
  { title: "羽目になる（はめになる）", meaning: "to get stuck with; to end up with ~" },
  { title: "ほどのことではない", meaning: "it's not worth; no need to ~" },
  { title: "ほうがましだ", meaning: "better than; would rather ~" },
  { title: "放題（ほうだい）", meaning: "doing as one pleases; to one's heart's content" },
  { title: "いかんだ / いかんでは / いかんによっては", meaning: "depending on; whether or not ~" },
  { title: "いかんにかかわらず / いかんによらず / いかんをとわず", meaning: "regardless of; whether or not ~" },
  { title: "いかなる", meaning: "any kind of; every; whatsoever; whatever" },
  { title: "いかに", meaning: "how; in what way; how much; to what extent" },
];

type GrammarSection = {
  key: string;
  label: string;
  description: string;
  items: GrammarCard[];
  source?: string;
};

const GRAMMAR_PROGRESS_KEY = "grammar_progress_v1";
const GRAMMAR_OPEN_SECTIONS_KEY = "grammar_open_sections_v1";

// Module-level caches so GrammarPage can remount without reloading/refetching.
let cachedKnownIds: string[] | null = null;
let cachedOpenSectionKeys: string[] | null = null;

let cachedDriveKnownIds: string[] | null = null;
let driveLoadPromise: Promise<string[] | null> | null = null;
let driveLastAttemptAtMs: number | null = null;

let driveSaveTimeoutId: number | null = null;
let lastQueuedDriveSaveSignature: string | null = null;

const DRIVE_RETRY_BACKOFF_MS = 60_000;

function readStoredStringArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === "string");
  } catch {
    return [];
  }
}

function signatureForIds(ids: string[]): string {
  return ids.slice().sort().join("|");
}

function queueDriveSave(ids: string[]) {
  if (typeof window === "undefined") return;

  const signature = signatureForIds(ids);
  if (signature === lastQueuedDriveSaveSignature) return;
  lastQueuedDriveSaveSignature = signature;

  if (driveSaveTimeoutId !== null) window.clearTimeout(driveSaveTimeoutId);
  driveSaveTimeoutId = window.setTimeout(() => {
    driveSaveTimeoutId = null;
    void bookMetadataService.saveGrammarProgress(ids);
  }, 800);
}

const buildGrammarId = (levelKey: string, title: string) => `${levelKey}:${title}`;

export function GrammarPage() {
  const { t } = useTranslation();
  const { isSignedIn, user } = useUser();
  const allowDriveSync =
    isSignedIn &&
    (user?.externalAccounts?.some((acc) => String((acc as any)?.provider || "").startsWith("google")) ??
      false);

  const [knownIds, setKnownIds] = useState<string[]>(() => {
    if (cachedKnownIds !== null) return cachedKnownIds;
    const stored = readStoredStringArray(GRAMMAR_PROGRESS_KEY);
    cachedKnownIds = stored;
    return stored;
  });

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    if (cachedOpenSectionKeys !== null) return new Set(cachedOpenSectionKeys);
    const stored = readStoredStringArray(GRAMMAR_OPEN_SECTIONS_KEY);
    const initial = stored.length > 0 ? stored : ["n4"];
    cachedOpenSectionKeys = initial;
    return new Set(initial);
  });

  const knownIdsRef = useRef<string[]>(knownIds);
  knownIdsRef.current = knownIds;

  const dirtyRef = useRef(false);

  const knownSet = useMemo(() => new Set(knownIds), [knownIds]);

  const sections: GrammarSection[] = useMemo(
    () => [
      {
        key: "n5",
        label: t("grammar.levels.n5"),
        description: t("grammar.empty", { level: "N5" }),
        items: N5_GRAMMAR,
        source: t("grammar.sources.n5"),
      },
      {
        key: "n4",
        label: t("grammar.levels.n4"),
        description: t("grammar.empty", { level: "N4" }),
        items: N4_GRAMMAR,
        source: t("grammar.sources.n4"),
      },
      {
        key: "n3",
        label: t("grammar.levels.n3"),
        description: t("grammar.empty", { level: "N3" }),
        items: N3_GRAMMAR,
        source: t("grammar.sources.n3"),
      },
      {
        key: "n2",
        label: t("grammar.levels.n2"),
        description: t("grammar.empty", { level: "N2" }),
        items: N2_GRAMMAR,
        source: t("grammar.sources.n2"),
      },
      {
        key: "n1",
        label: t("grammar.levels.n1"),
        description: t("grammar.empty", { level: "N1" }),
        items: N1_GRAMMAR,
      },
    ],
    [t]
  );

  useEffect(() => {
    cachedOpenSectionKeys = Array.from(openSections);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GRAMMAR_OPEN_SECTIONS_KEY, JSON.stringify(cachedOpenSectionKeys));
    } catch {
      // ignore storage errors
    }
  }, [openSections]);

  useEffect(() => {
    cachedKnownIds = knownIds;
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(knownIds));
    } catch {
      // ignore storage errors
    }

    if (dirtyRef.current) {
      dirtyRef.current = false;
      if (allowDriveSync) queueDriveSave(knownIds);
    }
  }, [knownIds, allowDriveSync]);

  useEffect(() => {
    if (!allowDriveSync) return;

    let cancelled = false;
    const mergeFromDrive = (driveKnown: string[]) => {
      if (cancelled) return;

      if (driveKnown.length > 0) {
        setKnownIds((prev) => {
          const merged = new Set([...prev, ...driveKnown]);
          if (merged.size === prev.length) return prev;
          return Array.from(merged);
        });
      }

      const localNow = knownIdsRef.current;
      if (localNow.length === 0) return;
      const driveSet = new Set(driveKnown);
      const localHasExtra = localNow.some((id) => !driveSet.has(id));
      if (localHasExtra) {
        queueDriveSave(Array.from(new Set([...localNow, ...driveKnown])));
      }
    };

    if (cachedDriveKnownIds !== null) {
      mergeFromDrive(cachedDriveKnownIds);
      return () => {
        cancelled = true;
      };
    }

    const now = Date.now();
    if (driveLastAttemptAtMs !== null && now - driveLastAttemptAtMs < DRIVE_RETRY_BACKOFF_MS) {
      return () => {
        cancelled = true;
      };
    }

    if (!driveLoadPromise) {
      driveLastAttemptAtMs = now;
      driveLoadPromise = bookMetadataService
        .loadGrammarProgress()
        .then((driveKnown) => {
          if (!driveKnown) return null;
          cachedDriveKnownIds = driveKnown;
          return driveKnown;
        })
        .catch(() => null)
        .finally(() => {
          driveLoadPromise = null;
        });
    }

    driveLoadPromise.then((driveKnown) => {
      if (!driveKnown) return;
      mergeFromDrive(driveKnown);
    });

    return () => {
      cancelled = true;
    };
  }, [allowDriveSync]);

  const toggleKnown = (levelKey: string, title: string) => {
    dirtyRef.current = true;
    const id = buildGrammarId(levelKey, title);
    setKnownIds((prev) => {
      if (prev.includes(id)) return prev.filter((entry) => entry !== id);
      return [...prev, id];
    });
  };

  const markSectionKnown = (sectionKey: string, items: GrammarCard[]) => {
    setKnownIds((prev) => {
      const next = new Set(prev);
      const beforeSize = next.size;
      items.forEach((item) => next.add(buildGrammarId(sectionKey, item.title)));
      if (next.size === beforeSize) return prev;
      dirtyRef.current = true;
      return Array.from(next);
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 dark:text-gray-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("grammar.header.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t("grammar.header.subtitle")}</p>
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const knownCount = section.items.filter((item) =>
            knownSet.has(buildGrammarId(section.key, item.title))
          ).length;
          const isComplete = section.items.length > 0 && knownCount === section.items.length;

          return (
            <details
              key={section.key}
              open={openSections.has(section.key)}
              onToggle={(event) => {
                const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                setOpenSections((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(section.key);
                  else next.delete(section.key);
                  return next;
                });
              }}
              className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700"
            >
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-4">
                <div className="font-semibold text-gray-900 dark:text-white">{section.label}</div>
                {section.items.length > 0 ? (
                  <div
                    className={`text-sm ${
                      isComplete ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {knownCount}/{section.items.length}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t("grammar.sections.empty")}</div>
                )}
              </summary>
              <div className="px-4 pb-4">
                {section.source || (openSections.has(section.key) && section.items.length > 0 && !isComplete) ? (
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{section.source}</div>
                    {openSections.has(section.key) && section.items.length > 0 && !isComplete ? (
                      <button
                        type="button"
                        onClick={() => markSectionKnown(section.key, section.items)}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-green-500 text-green-600 dark:text-green-400"
                      >
                        {t("grammar.markAll")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {section.items.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.items.map((item, index) => {
                      const itemId = buildGrammarId(section.key, item.title);
                      const isKnown = knownSet.has(itemId);
                      return (
                        <div
                          key={`${section.key}-${index}-${item.title}`}
                          className={`text-left bg-white dark:bg-gray-800 border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
                            isKnown ? "border-green-400 dark:border-green-500" : "border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                            {t("grammar.card.tag", { level: section.label })}
                          </div>
                          <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                            {item.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">{item.meaning}</div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {isKnown ? "Known" : "Not marked"}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleKnown(section.key, item.title)}
                              className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                                isKnown
                                  ? "border-green-500 text-green-600 dark:text-green-400"
                                  : "border-gray-300 text-gray-700 dark:text-gray-300 dark:border-gray-600"
                              }`}
                            >
                              {isKnown ? "Marked" : "Mark known"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{section.description}</p>
                    <button
                      type="button"
                      className="app-button-primary px-3 py-1.5 rounded-md text-sm font-medium"
                    >
                      {t("grammar.cta")}
                    </button>
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

export default GrammarPage;
