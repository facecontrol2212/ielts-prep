'use client'

import { createElement, Fragment, type ReactNode } from 'react'

/** `[[14]]` marks where question 14's input belongs inside a group's content_html. */
export const PLACEHOLDER = /\[\[(\d+)\]\]/g

/** The question numbers a content_html blob asks for, in document order. */
export function placeholderNumbers(html: string | null): number[] {
  if (!html) return []
  PLACEHOLDER.lastIndex = 0
  const out: number[] = []
  for (const match of html.matchAll(PLACEHOLDER)) {
    const n = Number(match[1])
    if (!out.includes(n)) out.push(n)
  }
  return out
}

/**
 * Tags the content pipeline is allowed to emit. Anything else is unwrapped (children kept)
 * and `script`/`style`/`iframe` are dropped outright — content is authored by us, but the
 * exam runner is the last place to be casual about injected markup.
 */
const ALLOWED = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'small', 'sup', 'sub',
  'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'code', 'pre',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'col', 'colgroup',
  'figure', 'figcaption', 'img', 'div', 'section',
])
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'])
const VOID = new Set(['br', 'hr', 'img', 'col'])

type Props = Record<string, string | number>

function propsOf(el: Element): Props {
  const props: Props = {}
  const colSpan = el.getAttribute('colspan')
  const rowSpan = el.getAttribute('rowspan')
  const scope = el.getAttribute('scope')
  const cls = el.getAttribute('class')
  if (colSpan) props.colSpan = Number(colSpan)
  if (rowSpan) props.rowSpan = Number(rowSpan)
  if (scope) props.scope = scope
  if (cls) props.className = cls
  if (el.tagName.toLowerCase() === 'img') {
    props.src = el.getAttribute('src') ?? ''
    props.alt = el.getAttribute('alt') ?? ''
  }
  if (el.tagName.toLowerCase() === 'ol') {
    const start = el.getAttribute('start')
    if (start) props.start = Number(start)
  }
  return props
}

function textToNodes(text: string, renderBlank: (n: number) => ReactNode, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  PLACEHOLDER.lastIndex = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(<Fragment key={`${keyBase}-b${i++}`}>{renderBlank(Number(match[1]))}</Fragment>)
    last = at + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function convert(node: Node, renderBlank: (n: number) => ReactNode, key: string): ReactNode {
  if (node.nodeType === 3) {
    const nodes = textToNodes(node.nodeValue ?? '', renderBlank, key)
    return nodes.length === 1 ? nodes[0] : <Fragment key={key}>{nodes}</Fragment>
  }
  if (node.nodeType !== 1) return null

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (DROPPED.has(tag)) return null

  const children = Array.from(el.childNodes).map((child, i) => convert(child, renderBlank, `${key}.${i}`))

  if (!ALLOWED.has(tag)) return <Fragment key={key}>{children}</Fragment>
  if (VOID.has(tag)) return createElement(tag, { key, ...propsOf(el) })
  return createElement(tag, { key, ...propsOf(el) }, children)
}

/**
 * Render a group's `content_html` with a live input wherever `[[n]]` appears.
 *
 * We walk the parsed DOM instead of splitting the string, because a blank routinely sits
 * mid-element (`<td>Built in [[7]]</td>`) and splitting would hand React two halves of a
 * broken tag.
 */
export function renderContentHtml(
  html: string,
  renderBlank: (n: number) => ReactNode,
): ReactNode {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(`<body><div>${html}</div></body>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return null
  return <>{Array.from(root.childNodes).map((child, i) => convert(child, renderBlank, `c${i}`))}</>
}

/** Table/list styling for authored content, without a global stylesheet change. */
export const CONTENT_CLASS = [
  'space-y-3 text-sm leading-relaxed text-fg',
  '[&_p]:leading-7',
  '[&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-muted',
  '[&_h4]:font-semibold',
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
  '[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
  '[&_caption]:pb-2 [&_caption]:text-left [&_caption]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top',
  '[&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:p-2 [&_th]:align-top [&_th]:font-semibold',
].join(' ')
