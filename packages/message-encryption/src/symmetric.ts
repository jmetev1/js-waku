import { Decoder as DecoderV0 } from "@waku/core/lib/message/version_0";
import type {
  EncoderOptions as BaseEncoderOptions,
  IDecoder,
  IEncoder,
  IMessage,
  IMetaSetter,
} from "@waku/interfaces";
import { proto_message } from "@waku/proto";
import debug from "debug";

import { DecodedMessage } from "./decoded_message.js";
import {
  decryptSymmetric,
  encryptSymmetric,
  postCipher,
  preCipher,
} from "./waku_payload.js";

import { generateSymmetricKey, OneMillion, Version } from "./index.js";

export { generateSymmetricKey };
export type { DecodedMessage, Encoder, Decoder };

const log = debug("waku:message-encryption:symmetric");

class Encoder implements IEncoder {
  constructor(
    public contentTopic: string,
    private symKey: Uint8Array,
    private sigPrivKey?: Uint8Array,
    public ephemeral: boolean = false,
    public metaSetter?: IMetaSetter
  ) {}

  async toWire(message: IMessage): Promise<Uint8Array | undefined> {
    const protoMessage = await this.toProtoObj(message);
    if (!protoMessage) return;

    return new proto_message.WakuMessage(protoMessage).toBinary();
  }

  async toProtoObj(
    message: IMessage
  ): Promise<proto_message.WakuMessage | undefined> {
    const timestamp = message.timestamp ?? new Date();
    const preparedPayload = await preCipher(message.payload, this.sigPrivKey);

    const payload = await encryptSymmetric(preparedPayload, this.symKey);

    const protoMessageWithoutMeta = new proto_message.WakuMessage({
      payload,
      version: Version,
      contentTopic: this.contentTopic,
      timestamp: BigInt(timestamp.valueOf()) * OneMillion,
      meta: undefined,
      rateLimitProof: message.rateLimitProof,
      ephemeral: this.ephemeral,
    }) as proto_message.WakuMessage & { meta: undefined };

    if (this.metaSetter) {
      const meta = this.metaSetter(protoMessageWithoutMeta);
      const protoMessageWithMeta = new proto_message.WakuMessage({
        ...protoMessageWithoutMeta,
        meta,
      });
      return protoMessageWithMeta;
    }

    return protoMessageWithoutMeta;
  }
}

export interface EncoderOptions extends BaseEncoderOptions {
  /** The symmetric key to encrypt the payload with. */
  symKey: Uint8Array;
  /** An optional private key to be used to sign the payload before encryption. */
  sigPrivKey?: Uint8Array;
}

/**
 * Creates an encoder that encrypts messages using symmetric encryption for the
 * given key, as defined in [26/WAKU2-PAYLOAD](https://rfc.vac.dev/spec/26/).
 *
 * An encoder is used to encode messages in the [`14/WAKU2-MESSAGE](https://rfc.vac.dev/spec/14/)
 * format to be sent over the Waku network. The resulting encoder can then be
 * pass to { @link @waku/interfaces.LightPush.push } or
 * { @link @waku/interfaces.Relay.send } to automatically encrypt
 * and encode outgoing messages.
 *
 * The payload can optionally be signed with the given private key as defined
 * in [26/WAKU2-PAYLOAD](https://rfc.vac.dev/spec/26/).
 */
export function createEncoder({
  contentTopic,
  symKey,
  sigPrivKey,
  ephemeral = false,
  metaSetter,
}: EncoderOptions): Encoder {
  return new Encoder(contentTopic, symKey, sigPrivKey, ephemeral, metaSetter);
}

class Decoder extends DecoderV0 implements IDecoder<DecodedMessage> {
  constructor(contentTopic: string, private symKey: Uint8Array) {
    super(contentTopic);
  }

  async fromProtoObj(
    pubSubTopic: string,
    protoMessage: proto_message.WakuMessage
  ): Promise<DecodedMessage | undefined> {
    const cipherPayload = protoMessage.payload;

    if (protoMessage.version !== Version) {
      log(
        "Failed to decrypt due to incorrect version, expected:",
        Version,
        ", actual:",
        protoMessage.version
      );
      return;
    }

    let payload;

    try {
      payload = await decryptSymmetric(cipherPayload, this.symKey);
    } catch (e) {
      log(
        `Failed to decrypt message using asymmetric decryption for contentTopic: ${this.contentTopic}`,
        e
      );
      return;
    }

    if (!payload) {
      log(`Failed to decrypt payload for contentTopic ${this.contentTopic}`);
      return;
    }

    const res = await postCipher(payload);

    if (!res) {
      log(`Failed to decode payload for contentTopic ${this.contentTopic}`);
      return;
    }

    log("Message decrypted", protoMessage);
    return new DecodedMessage(
      pubSubTopic,
      protoMessage,
      res.payload,
      res.sig?.signature,
      res.sig?.publicKey
    );
  }
}

/**
 * Creates a decoder that decrypts messages using symmetric encryption, using
 * the given key as defined in [26/WAKU2-PAYLOAD](https://rfc.vac.dev/spec/26/).
 *
 * A decoder is used to decode messages from the [14/WAKU2-MESSAGE](https://rfc.vac.dev/spec/14/)
 * format when received from the Waku network. The resulting decoder can then be
 * pass to { @link @waku/interfaces.Filter.subscribe } or
 * { @link @waku/interfaces.Relay.subscribe } to automatically decrypt and
 * decode incoming messages.
 *
 * @param contentTopic The resulting decoder will only decode messages with this content topic.
 * @param symKey The symmetric key used to decrypt the message.
 */
export function createDecoder(
  contentTopic: string,
  symKey: Uint8Array
): Decoder {
  return new Decoder(contentTopic, symKey);
}
