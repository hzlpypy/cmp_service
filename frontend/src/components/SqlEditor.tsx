import { useRef, useEffect } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { sql, MySQL, PostgreSQL, SQLite, MSSQL, PLSQL } from '@codemirror/lang-sql'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from '@codemirror/language'
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: string
  dialect?: 'mysql' | 'postgresql' | 'sqlite' | 'mssql' | 'plsql'
  readOnly?: boolean
  tables?: Record<string, string[]>
}

const dialectMap = {
  mysql: MySQL,
  postgresql: PostgreSQL,
  sqlite: SQLite,
  mssql: MSSQL,
  plsql: PLSQL,
}

export default function SqlEditor({
  value,
  onChange,
  placeholder = '输入SQL查询...',
  height = '200px',
  dialect = 'mysql',
  readOnly = false,
  tables = {},
}: SqlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    const dialectSchema = dialectMap[dialect] || MySQL

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        sql({
          dialect: dialectSchema,
          schema: tables,
          upperCaseKeywords: true,
        }),
        syntaxHighlighting(defaultHighlightStyle),
        cmPlaceholder(placeholder),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': {
            height: height,
            fontSize: '13px',
            backgroundColor: '#fff',
          },
          '.cm-scroller': {
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', monospace",
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '8px 0',
            caretColor: '#333',
          },
          '.cm-line': {
            padding: '0 8px',
          },
          '.cm-gutters': {
            backgroundColor: '#f8f9fa',
            color: '#999',
            border: 'none',
            borderRight: '1px solid #eee',
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#f0f0f0',
            color: '#666',
          },
          '.cm-activeLine': {
            backgroundColor: '#f5f5f5',
          },
          '.cm-selectionBackground': {
            backgroundColor: '#b3d4fc !important',
          },
          '&.cm-focused .cm-selectionBackground': {
            backgroundColor: '#b3d4fc !important',
          },
          '.cm-cursor': {
            borderLeftColor: '#333',
          },
          '.cm-tooltip': {
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          },
          '.cm-tooltip-autocomplete': {
            '& > ul > li[aria-selected]': {
              backgroundColor: '#e8e8e8',
              color: '#333',
            },
          },
        }),
        EditorState.readOnly.of(readOnly),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={editorRef}
      className="sql-editor-container"
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    />
  )
}
