import { Highlight, themes } from 'prism-react-renderer';
import { CopyButton } from './CopyButton';
import type { Persona } from '../types';

interface ApiEndpointDisplayProps {
  persona: Pick<Persona, 'apiEndpoint' | 'chatflowId'>;
}

export function ApiEndpointDisplay({ persona }: ApiEndpointDisplayProps) {
  const pythonCode = `import requests

url = "${persona.apiEndpoint}"
payload = {"question": "Hello, who are you?"}

response = requests.post(url, json=payload)
print(response.json())`;

  return (
    <div className="space-y-4">
      {/* Chatflow ID */}
      <div>
        <label className="block text-sm font-display font-medium text-gray-300 mb-1">
          Chatflow ID
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 glass border border-white/10 rounded-lg text-sm font-mono text-gray-200">
            {persona.chatflowId}
          </code>
          <CopyButton text={persona.chatflowId} />
        </div>
      </div>

      {/* API Endpoint URL */}
      <div>
        <label className="block text-sm font-display font-medium text-gray-300 mb-1">
          Prediction URL
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 glass border border-white/10 rounded-lg text-sm font-mono text-gray-200 break-all">
            {persona.apiEndpoint}
          </code>
          <CopyButton text={persona.apiEndpoint} />
        </div>
      </div>

      {/* Python Code Snippet */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-display font-medium text-gray-300">
            Python Example
          </label>
          <CopyButton text={pythonCode} label="Copy Code" />
        </div>
        <Highlight theme={themes.nightOwl} code={pythonCode} language="python">
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={`${className} rounded-lg p-4 overflow-x-auto`}
              style={style}
            >
              {tokens.map((line, i) => {
                const { key, ...lineProps } = getLineProps({ line });
                return (
                  <div key={i} {...lineProps}>
                    {line.map((token, tokenIndex) => {
                      const { key: tokenKey, ...tokenProps } = getTokenProps({ token });
                      return <span key={tokenIndex} {...tokenProps} />;
                    })}
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
