import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components: Components = {
    code(props) {
      const { className, children } = props;
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (language) {
        return (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            className="rounded-md my-2 text-sm"
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }

      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
          {children}
        </code>
      );
    },
    p({ children }) {
      return <p className="mb-2 last:mb-0">{children}</p>;
    },
    h1({ children }) {
      return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-base font-bold mt-3 mb-1">{children}</h3>;
    },
    ul({ children }) {
      return <ul className="list-disc pl-5 mb-2">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal pl-5 mb-2">{children}</ol>;
    },
    li({ children }) {
      return <li className="mb-1">{children}</li>;
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {children}
        </a>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-4 border-muted pl-4 italic my-2 text-muted-foreground">
          {children}
        </blockquote>
      );
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="border-collapse border border-border w-full text-sm">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-muted">{children}</thead>;
    },
    th({ children }) {
      return (
        <th className="border border-border px-3 py-2 text-left font-semibold">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="border border-border px-3 py-2">
          {children}
        </td>
      );
    },
    hr() {
      return <hr className="my-4 border-border" />;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
