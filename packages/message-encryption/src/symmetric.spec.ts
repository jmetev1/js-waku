import { proto_message } from "@waku/proto";
import { expect } from "chai";
import fc from "fast-check";

import { getPublicKey } from "./crypto/index.js";
import { createDecoder, createEncoder } from "./symmetric.js";

describe("Symmetric Encryption", function () {
  it("Round trip binary encryption [symmetric, no signature]", async function () {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string(),
        fc.uint8Array({ minLength: 1 }),
        fc.uint8Array({ min: 1, minLength: 32, maxLength: 32 }),
        async (pubSubTopic, contentTopic, payload, symKey) => {
          const encoder = createEncoder({
            contentTopic,
            symKey,
          });
          const bytes = await encoder.toWire({ payload });

          const decoder = createDecoder(contentTopic, symKey);
          const protoResult = await decoder.fromWireToProtoObj(bytes!);
          if (!protoResult) throw "Failed to proto decode";
          const result = await decoder.fromProtoObj(pubSubTopic, protoResult);
          if (!result) throw "Failed to decode";

          expect(result.contentTopic).to.equal(contentTopic);
          expect(result.pubSubTopic).to.equal(pubSubTopic);
          expect(result.version).to.equal(1);
          expect(result?.payload).to.deep.equal(payload);
          expect(result.signature).to.be.undefined;
          expect(result.signaturePublicKey).to.be.undefined;
        }
      )
    );
  });

  it("Round trip binary encryption [symmetric, signature]", async function () {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string(),
        fc.uint8Array({ minLength: 1 }),
        fc.uint8Array({ min: 1, minLength: 32, maxLength: 32 }),
        fc.uint8Array({ min: 1, minLength: 32, maxLength: 32 }),
        async (pubSubTopic, contentTopic, payload, sigPrivKey, symKey) => {
          const sigPubKey = getPublicKey(sigPrivKey);

          const encoder = createEncoder({
            contentTopic,
            symKey,
            sigPrivKey,
          });
          const bytes = await encoder.toWire({ payload });

          const decoder = createDecoder(contentTopic, symKey);
          const protoResult = await decoder.fromWireToProtoObj(bytes!);
          if (!protoResult) throw "Failed to proto decode";
          const result = await decoder.fromProtoObj(pubSubTopic, protoResult);
          if (!result) throw "Failed to decode";

          expect(result.contentTopic).to.equal(contentTopic);
          expect(result.pubSubTopic).to.equal(pubSubTopic);
          expect(result.version).to.equal(1);
          expect(result?.payload).to.deep.equal(payload);
          expect(result.signature).to.not.be.undefined;
          expect(result.signaturePublicKey).to.deep.eq(sigPubKey);
        }
      )
    );
  });

  it("Check meta is set [symmetric]", async function () {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string(),
        fc.uint8Array({ minLength: 1 }),
        fc.uint8Array({ min: 1, minLength: 32, maxLength: 32 }),
        async (pubSubTopic, contentTopic, payload, symKey) => {
          const metaSetter = (
            msg: proto_message.WakuMessage & { meta: undefined }
          ): Uint8Array => {
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);
            view.setUint32(0, msg.payload.length, false);
            return new Uint8Array(buffer);
          };

          const encoder = createEncoder({
            contentTopic,
            symKey,
            metaSetter,
          });
          const bytes = await encoder.toWire({ payload });

          const decoder = createDecoder(contentTopic, symKey);
          const protoResult = await decoder.fromWireToProtoObj(bytes!);
          if (!protoResult) throw "Failed to proto decode";
          const result = await decoder.fromProtoObj(pubSubTopic, protoResult);
          if (!result) throw "Failed to decode";

          const expectedMeta = metaSetter(
            new proto_message.WakuMessage({
              payload: protoResult.payload,
              timestamp: undefined,
              contentTopic: "",
              ephemeral: undefined,
              meta: undefined,
              rateLimitProof: undefined,
              version: undefined,
            }) as proto_message.WakuMessage & { meta: undefined }
          );

          expect(result.meta).to.deep.equal(expectedMeta);
        }
      )
    );
  });
});
