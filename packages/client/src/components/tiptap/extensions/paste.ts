import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { markdownSerializer } from '../services/markdown/serializer';
import { EXTENSION_PRIORITY_HIGHEST } from '../constants';
import { handleFileEvent } from '../services/upload';
import { isInCode, LANGUAGES } from '../services/code';
import { isMarkdown, normalizePastedMarkdown } from '../services/markdown/helpers';
import { isTitleNode } from '../services/node';

export const Paste = Extension.create({
  name: 'paste',
  priority: EXTENSION_PRIORITY_HIGHEST,
  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('paste'),
        props: {
          handlePaste: (view, event: ClipboardEvent) => {
            if (view.props.editable && !view.props.editable(view.state)) {
              return false;
            }
            if (!event.clipboardData) return false;

            const files = Array.from(event.clipboardData.files);

            if (files.length) {
              event.preventDefault();
              files.forEach((file) => {
                handleFileEvent({ editor, file });
              });
              return true;
            }

            const text = event.clipboardData.getData('text/plain');
            const html = event.clipboardData.getData('text/html');
            const vscode = event.clipboardData.getData('vscode-editor-data');

            // 粘贴代码
            if (isInCode(view.state)) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText(text));
              return true;
            }

            const vscodeMeta = vscode ? JSON.parse(vscode) : undefined;
            const pasteCodeLanguage = vscodeMeta?.mode;

            if (pasteCodeLanguage && pasteCodeLanguage !== 'markdown') {
              event.preventDefault();
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.codeBlock.create({
                    language: Object.keys(LANGUAGES).includes(vscodeMeta.mode) ? vscodeMeta.mode : null,
                  })
                )
              );
              view.dispatch(view.state.tr.insertText(text));
              return true;
            }

            // 处理 markdown
            if (isMarkdown(text) || html.length === 0 || pasteCodeLanguage === 'markdown') {
              event.preventDefault();
              const firstNode = view.props.state.doc.content.firstChild;
              const hasTitle = isTitleNode(firstNode) && firstNode.content.size > 0;
              const schema = view.props.state.schema;
              const doc = markdownSerializer.markdownToProsemirror({
                schema,
                content: normalizePastedMarkdown(text),
                hasTitle,
              });
              // @ts-ignore
              const transaction = view.state.tr.insert(view.state.selection.head, view.state.schema.nodeFromJSON(doc));
              view.dispatch(transaction);
              return true;
            }

            if (text.length !== 0) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText(text));
              return true;
            }

            return false;
          },
          handleDrop: (view, event: any) => {
            if (view.props.editable && !view.props.editable(view.state)) {
              return false;
            }

            const hasFiles = event.dataTransfer.files.length > 0;
            if (!hasFiles) return false;

            event.preventDefault();

            const files = Array.from(event.dataTransfer.files);
            if (files.length) {
              event.preventDefault();
              files.forEach((file: File) => {
                handleFileEvent({ editor, file });
              });
              return true;
            }

            return false;
          },
          clipboardTextSerializer: (slice) => {
            const doc = this.editor.schema.topNodeType.createAndFill(undefined, slice.content);
            if (!doc) {
              return '';
            }
            const content = markdownSerializer.proseMirrorToMarkdown({
              schema: this.editor.schema,
              content: doc,
            });

            return content;
          },
        },
      }),
    ];
  },
});
