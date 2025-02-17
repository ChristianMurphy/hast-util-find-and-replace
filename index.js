/**
 * @typedef Options
 * @property {Test} [ignore]
 *
 * @typedef {import('hast').Text} Text
 * @typedef {import('hast').Parent} Parent
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Element['children'][number]} Content
 * @typedef {Parent['children'][number]|Root} Node
 *
 * @typedef {import('hast-util-is-element').Test} Test
 * @typedef {import('unist-util-visit-parents').VisitorResult} VisitorResult
 *
 * @typedef RegExpMatchObject
 * @property {number} index
 * @property {string} input
 *
 * @typedef {string|RegExp} Find
 * @typedef {string|ReplaceFunction} Replace
 *
 * @typedef {[Find, Replace]} FindAndReplaceTuple
 * @typedef {Object.<string, Replace>} FindAndReplaceSchema
 * @typedef {Array.<FindAndReplaceTuple>} FindAndReplaceList
 *
 * @typedef {[RegExp, ReplaceFunction]} Pair
 * @typedef {Array.<Pair>} Pairs
 */

/**
 * @callback ReplaceFunction
 * @param {...any} parameters
 * @returns {Array.<Content>|Content|string|false|undefined|null}
 */

import {visitParents} from 'unist-util-visit-parents'
import {convertElement} from 'hast-util-is-element'
import escape from 'escape-string-regexp'

const own = {}.hasOwnProperty

export const defaultIgnore = ['title', 'script', 'style', 'svg', 'math']

/**
 * @param {Node} tree
 * @param {Find|FindAndReplaceSchema|FindAndReplaceList} find
 * @param {Replace|Options} [replace]
 * @param {Options} [options]
 */
export function findAndReplace(tree, find, replace, options) {
  /** @type {Options|undefined} */
  let settings
  /** @type {FindAndReplaceSchema|FindAndReplaceList} */
  let schema

  if (typeof find === 'string' || find instanceof RegExp) {
    // @ts-expect-error don’t expect options twice.
    schema = [[find, replace]]
    settings = options
  } else {
    schema = find
    // @ts-expect-error don’t expect replace twice.
    settings = replace
  }

  if (!settings) {
    settings = {}
  }

  const ignored = convertElement(settings.ignore || defaultIgnore)
  const pairs = toPairs(schema)
  let pairIndex = -1

  while (++pairIndex < pairs.length) {
    visitParents(tree, 'text', visitor)
  }

  return tree

  /** @type {import('unist-util-visit-parents').Visitor<Text>} */
  function visitor(node, parents) {
    let index = -1
    /** @type {Parent|undefined} */
    let grandparent

    while (++index < parents.length) {
      const parent = parents[index]

      if (
        ignored(
          parent,
          // @ts-expect-error hast vs. unist parent.
          grandparent ? grandparent.children.indexOf(parent) : undefined,
          grandparent
        )
      ) {
        return
      }

      // @ts-expect-error hast vs. unist parent.
      grandparent = parent
    }

    if (grandparent) {
      return handler(node, grandparent)
    }
  }

  /**
   * @param {Text} node
   * @param {Parent} parent
   * @returns {VisitorResult}
   */
  function handler(node, parent) {
    const find = pairs[pairIndex][0]
    const replace = pairs[pairIndex][1]
    let start = 0
    let index = parent.children.indexOf(node)
    /** @type {Array.<Content>} */
    let nodes = []
    /** @type {number|undefined} */
    let position

    find.lastIndex = 0

    let match = find.exec(node.value)

    while (match) {
      position = match.index
      // @ts-expect-error this is perfectly fine, typescript.
      let value = replace(...match, {index: match.index, input: match.input})

      if (typeof value === 'string') {
        value = value.length > 0 ? {type: 'text', value} : undefined
      }

      if (value !== false) {
        if (start !== position) {
          nodes.push({type: 'text', value: node.value.slice(start, position)})
        }

        if (Array.isArray(value)) {
          nodes.push(...value)
        } else if (value) {
          nodes.push(value)
        }

        start = position + match[0].length
      }

      if (!find.global) {
        break
      }

      match = find.exec(node.value)
    }

    if (position === undefined) {
      nodes = [node]
      index--
    } else {
      if (start < node.value.length) {
        nodes.push({type: 'text', value: node.value.slice(start)})
      }

      parent.children.splice(index, 1, ...nodes)
    }

    return index + nodes.length + 1
  }
}

/**
 * @param {FindAndReplaceSchema|FindAndReplaceList} schema
 * @returns {Pairs}
 */
function toPairs(schema) {
  /** @type {Pairs} */
  const result = []

  if (typeof schema !== 'object') {
    throw new TypeError('Expected array or object as schema')
  }

  if (Array.isArray(schema)) {
    let index = -1

    while (++index < schema.length) {
      result.push([
        toExpression(schema[index][0]),
        toFunction(schema[index][1])
      ])
    }
  } else {
    /** @type {string} */
    let key

    for (key in schema) {
      if (own.call(schema, key)) {
        result.push([toExpression(key), toFunction(schema[key])])
      }
    }
  }

  return result
}

/**
 * @param {Find} find
 * @returns {RegExp}
 */
function toExpression(find) {
  return typeof find === 'string' ? new RegExp(escape(find), 'g') : find
}

/**
 * @param {Replace} replace
 * @returns {ReplaceFunction}
 */
function toFunction(replace) {
  return typeof replace === 'function' ? replace : () => replace
}
