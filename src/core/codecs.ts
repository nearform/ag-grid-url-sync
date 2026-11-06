import type { Codec, ResolvedOptions, SerializationFormat } from './types.js'
import { DEFAULT_CONFIG } from './options.js'

// The codecs of createGridUrlSync (#221). A codec is an empty frozen object:
// its settings are kept here, so later changes to the inside (#224, #225) do
// not change a public type.

/** The options that a codec sets */
export type CodecOptions = Pick<
  ResolvedOptions,
  'serialization' | 'paramPrefix' | 'groupedParam' | 'format'
>

const settings = new WeakMap<Codec, CodecOptions>()

function makeCodec(options: CodecOptions): Codec {
  // SAFETY: the brand is a type-only symbol with no runtime value. A frozen
  // empty object is the whole codec; its settings are in the WeakMap.
  const codec = Object.freeze({}) as Codec
  settings.set(codec, options)

  return codec
}

/**
 * One URL param for each filter, for example `?f_name_contains=jo`
 * @param options.prefix - The start of each param name. Default `'f_'`.
 */
export function individual(
  options: { prefix?: string | undefined } = {}
): Codec {
  return makeCodec({
    serialization: 'individual',
    paramPrefix: options.prefix ?? DEFAULT_CONFIG.paramPrefix,
    groupedParam: DEFAULT_CONFIG.groupedParam,
    format: DEFAULT_CONFIG.format
  })
}

/**
 * All the filters in one URL param
 * @param options.param - The param name. Default `'grid_filters'`.
 * @param options.format - `'querystring'` (default), `'json'` or `'base64'`
 */
export function grouped(
  options: {
    param?: string | undefined
    format?: SerializationFormat | undefined
  } = {}
): Codec {
  return makeCodec({
    serialization: 'grouped',
    paramPrefix: DEFAULT_CONFIG.paramPrefix,
    groupedParam: options.param ?? DEFAULT_CONFIG.groupedParam,
    format: options.format ?? DEFAULT_CONFIG.format
  })
}

/** The options of a codec. Throws for an object that no factory made. */
export function codecOptions(codec: Codec): CodecOptions {
  const options = settings.get(codec)

  if (!options) {
    throw new TypeError('codec must come from individual() or grouped()')
  }

  return options
}

/**
 * A codec with all four settings. Internal: `useGridUrlSync` makes its
 * codec again from the settings of the app's codec, so a new codec object
 * with the same settings makes no new sync (#271). Not exported from the
 * package.
 */
export function codecFromOptions(options: CodecOptions): Codec {
  return makeCodec({
    serialization: options.serialization,
    paramPrefix: options.paramPrefix,
    groupedParam: options.groupedParam,
    format: options.format
  })
}
