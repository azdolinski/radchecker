declare module "radius" {
  export type AttributeTuple = [string, string | number | Buffer];

  export interface DecodedPacket {
    code: string;
    identifier: number;
    length: number;
    authenticator: Buffer;
    attributes: Record<string, string | number | Buffer | Array<string | number | Buffer>>;
    raw_attributes: Array<[number, Buffer]>;
  }

  export interface DecodeArgs {
    packet: Buffer;
    secret?: string;
  }

  export interface EncodeResponseArgs {
    packet: DecodedPacket;
    code: string;
    secret: string;
    attributes?: AttributeTuple[];
    add_message_authenticator?: boolean;
  }

  export interface EncodeArgs {
    code: string;
    identifier?: number;
    secret: string;
    attributes?: AttributeTuple[];
    authenticator?: Buffer;
    add_message_authenticator?: boolean;
  }

  export function decode(args: DecodeArgs): DecodedPacket;
  export function decode_without_secret(args: { packet: Buffer }): DecodedPacket;
  export function encode(args: EncodeArgs): Buffer;
  export function encode_response(args: EncodeResponseArgs): Buffer;
  export function add_dictionary(file: string): void;
}
