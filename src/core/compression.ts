/**
 * Phase 3: Advanced URL Compression Utilities
 *
 * Provides URL compression with multiple algorithms and automatic fallback
 */

import type {
  CompressionConfig,
  CompressionResult,
  CompressionContext,
  InternalConfig
} from './types.js'
import { URLSyncError } from './types.js'

/**
 * Compression engine with smart algorithm selection
 */
export class CompressionEngine {
  private config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.config = config
  }

  /**
   * Compresses data using the best available algorithm
   */
  async compress(data: string): Promise<CompressionResult> {
    const originalLength = data.length

    // Skip compression if below threshold or disabled
    if (
      this.config.strategy === 'never' ||
      (this.config.strategy === 'auto' &&
        originalLength < this.config.threshold)
    ) {
      return {
        data,
        method: 'none',
        originalLength,
        compressedLength: originalLength,
        ratio: 1.0
      }
    }

    // Try algorithms in order of preference
    let bestResult: CompressionResult | null = null

    for (const algorithm of this.config.algorithms) {
      try {
        const result = await this.compressWithAlgorithm(data, algorithm)

        // Keep track of best result
        if (!bestResult || result.ratio < bestResult.ratio) {
          bestResult = result
        }

        // If compression is very effective (saves at least 10%), return immediately
        if (result.ratio < 0.9) {
          return result
        }
      } catch (error) {
        // Continue to next algorithm
        if (this.config.strategy === 'always') {
          console.warn(`Compression with ${algorithm} failed:`, error)
        }
      }
    }

    // Return best result if we have one and strategy demands it
    if (
      bestResult &&
      (this.config.strategy === 'always' ||
        (this.config.strategy === 'auto' &&
          originalLength > this.config.threshold))
    ) {
      return bestResult
    }

    // Fallback to no compression
    return {
      data,
      method: 'none',
      originalLength,
      compressedLength: originalLength,
      ratio: 1.0
    }
  }

  /**
   * Decompresses data based on detected compression method
   */
  async decompress(data: string, method: string): Promise<string> {
    if (method === 'none' || !method) {
      return data
    }

    try {
      switch (method) {
        case 'lz':
          return this.decompressLZ(data)
        case 'gzip':
          return this.decompressGZip(data)
        case 'base64':
          return this.decompressBase64(data)
        default:
          throw new URLSyncError(`Unknown compression method: ${method}`)
      }
    } catch (error) {
      throw new URLSyncError(
        `Failed to decompress data with method '${method}': ${(error as Error).message}`
      )
    }
  }

  /**
   * Detects compression method from data
   */
  detectCompressionMethod(data: string): string {
    if (data.startsWith('lz:')) return 'lz'
    if (data.startsWith('gz:')) return 'gzip'
    if (data.startsWith('b64:')) return 'base64'
    return 'none'
  }

  /**
   * Compresses data using specific algorithm
   */
  private async compressWithAlgorithm(
    data: string,
    algorithm: string
  ): Promise<CompressionResult> {
    const originalLength = data.length
    let compressedData: string
    let method: string

    switch (algorithm) {
      case 'lz':
        compressedData = this.compressLZ(data)
        method = 'lz'
        break
      case 'gzip':
        compressedData = this.compressGZip(data)
        method = 'gzip'
        break
      case 'base64':
        compressedData = this.compressBase64(data)
        method = 'base64'
        break
      default:
        throw new Error(`Unsupported compression algorithm: ${algorithm}`)
    }

    const compressedLength = compressedData.length
    const ratio = compressedLength / originalLength

    return {
      data: compressedData,
      method,
      originalLength,
      compressedLength,
      ratio
    }
  }

  /**
   * Simple LZ-like compression
   */
  private compressLZ(data: string): string {
    const compressed = this.simpleLZCompress(data)
    return `lz:${compressed}`
  }

  private decompressLZ(data: string): string {
    const compressed = data.startsWith('lz:') ? data.slice(3) : data
    return this.simpleLZDecompress(compressed)
  }

  /**
   * Run-length encoding compression
   */
  private compressGZip(data: string): string {
    const compressed = this.runLengthCompress(data)
    return `gz:${compressed}`
  }

  private decompressGZip(data: string): string {
    const compressed = data.startsWith('gz:') ? data.slice(3) : data
    return this.runLengthDecompress(compressed)
  }

  /**
   * Base64 URL-safe compression
   */
  private compressBase64(data: string): string {
    const compressed = btoa(data).replace(/[+/=]/g, match => {
      switch (match) {
        case '+':
          return '-'
        case '/':
          return '_'
        case '=':
          return ''
        default:
          return match
      }
    })
    return `b64:${compressed}`
  }

  private decompressBase64(data: string): string {
    const compressed = data.startsWith('b64:') ? data.slice(4) : data

    // Reverse URL-safe base64
    let base64 = compressed.replace(/[-_]/g, match => {
      switch (match) {
        case '-':
          return '+'
        case '_':
          return '/'
        default:
          return match
      }
    })

    // Add padding
    while (base64.length % 4) {
      base64 += '='
    }

    return atob(base64)
  }

  /**
   * Simple LZ compression implementation
   */
  private simpleLZCompress(input: string): string {
    if (input.length === 0) return ''

    // Simple dictionary-based compression
    const dict = new Map<string, string>()
    let result = ''
    let dictIndex = 0

    for (let i = 0; i < input.length; i++) {
      let found = false
      for (let len = Math.min(10, input.length - i); len >= 2; len--) {
        const substr = input.slice(i, i + len)
        if (dict.has(substr)) {
          result += dict.get(substr) || ''
          i += len - 1
          found = true
          break
        }
      }

      if (!found) {
        const char = input[i]
        result += char

        // Add to dictionary (use safe character codes)
        if (i + 2 <= input.length) {
          const substr = input.slice(i, i + 2)
          if (!dict.has(substr) && dictIndex < 200) {
            // Use safe Latin-1 range (160-255)
            const key = String.fromCharCode(160 + dictIndex)
            dict.set(substr, key)
            dictIndex++
          }
        }
      }
    }

    // Convert to URL-safe base64
    return btoa(result).replace(/[+/=]/g, match => {
      switch (match) {
        case '+':
          return '-'
        case '/':
          return '_'
        case '=':
          return ''
        default:
          return match
      }
    })
  }

  private simpleLZDecompress(compressed: string): string {
    if (compressed.length === 0) return ''

    // Reverse URL-safe base64
    let base64 = compressed.replace(/[-_]/g, match => {
      switch (match) {
        case '-':
          return '+'
        case '_':
          return '/'
        default:
          return match
      }
    })

    while (base64.length % 4) {
      base64 += '='
    }

    try {
      return atob(base64)
    } catch {
      return compressed // Fallback to original if decompression fails
    }
  }

  /**
   * Run-length encoding
   */
  private runLengthCompress(input: string): string {
    if (input.length === 0) return ''

    let result = ''
    let count = 1
    let current = input[0] || ''

    for (let i = 1; i < input.length; i++) {
      if (input[i] === current && count < 255) {
        count++
      } else {
        if (count > 3 || current === '@') {
          result += `@${count.toString(36)}${current}`
        } else {
          result += current.repeat(count)
        }
        current = input[i] || ''
        count = 1
      }
    }

    // Handle last group
    if (count > 3 || current === '@') {
      result += `@${count.toString(36)}${current}`
    } else {
      result += current.repeat(count)
    }

    // Base64 encode
    return btoa(result).replace(/[+/=]/g, match => {
      switch (match) {
        case '+':
          return '-'
        case '/':
          return '_'
        case '=':
          return ''
        default:
          return match
      }
    })
  }

  private runLengthDecompress(compressed: string): string {
    if (compressed.length === 0) return ''

    // Reverse URL-safe base64
    let base64 = compressed.replace(/[-_]/g, match => {
      switch (match) {
        case '-':
          return '+'
        case '_':
          return '/'
        default:
          return match
      }
    })

    while (base64.length % 4) {
      base64 += '='
    }

    let input: string
    try {
      input = atob(base64)
    } catch {
      return compressed // Fallback
    }

    let result = ''
    let i = 0

    while (i < input.length) {
      if (input[i] === '@' && i + 2 < input.length) {
        const countStr = input[i + 1] || ''
        const char = input[i + 2] || ''
        const count = parseInt(countStr, 36)
        result += char.repeat(count)
        i += 3
      } else {
        result += input[i]
        i++
      }
    }

    return result
  }
}

/**
 * Creates a compression engine with the given configuration
 */
export function createCompressionEngine(
  config: CompressionConfig
): CompressionEngine {
  return new CompressionEngine(config)
}

/**
 * Compresses filter state data with smart algorithm selection
 */
export async function compressFilterData(
  data: string,
  config: InternalConfig
): Promise<CompressionResult> {
  const engine = createCompressionEngine(config.compression)

  try {
    return await engine.compress(data)
  } catch (error) {
    const context: CompressionContext = {
      originalData: data,
      originalLength: data.length,
      method: 'auto',
      operation: 'compress'
    }

    config.onError.compression(error as Error, context)

    // Fallback to no compression
    return {
      data,
      method: 'none',
      originalLength: data.length,
      compressedLength: data.length,
      ratio: 1.0
    }
  }
}

/**
 * Decompresses filter state data
 */
export async function decompressFilterData(
  data: string,
  method: string,
  config: InternalConfig
): Promise<string> {
  const engine = createCompressionEngine(config.compression)

  try {
    return await engine.decompress(data, method)
  } catch (error) {
    const context: CompressionContext = {
      originalData: data,
      originalLength: data.length,
      method,
      operation: 'decompress'
    }

    config.onError.compression(error as Error, context)

    // Return original data as fallback
    return data
  }
}
