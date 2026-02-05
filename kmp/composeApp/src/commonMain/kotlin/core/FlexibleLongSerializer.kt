package com.progressivereader.kmp.core

import kotlinx.serialization.KSerializer
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Accepts JSON numbers or numeric strings, decoding to [Long?].
 *
 * Google Drive (and some backend layers) commonly represent integer fields as strings.
 */
@OptIn(ExperimentalSerializationApi::class)
object FlexibleLongSerializer : KSerializer<Long?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleLong", PrimitiveKind.LONG)

    override fun deserialize(decoder: Decoder): Long? {
        val jsonDecoder = decoder as? JsonDecoder
        if (jsonDecoder != null) {
            val el = jsonDecoder.decodeJsonElement()
            val p = el as? JsonPrimitive ?: return null
            return p.longOrNull ?: p.content.toLongOrNull()
        }

        // Fallback: attempt direct long decode, then string.
        return runCatching { decoder.decodeLong() }
            .recoverCatching { decoder.decodeString().toLongOrNull() }
            .getOrNull()
    }

    override fun serialize(encoder: Encoder, value: Long?) {
        if (value == null) {
            // Encode null by encoding an empty string would be incorrect; delegate to nullable field handling.
            encoder.encodeNull()
            return
        }
        encoder.encodeLong(value)
    }
}
