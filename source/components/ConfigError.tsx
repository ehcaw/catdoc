import React from 'react';
import {Box, Text} from 'ink';

interface ConfigErrorProps {
    onBack: () => void;
}

export const ConfigError: React.FC<ConfigErrorProps> = ({onBack}) => {
    React.useEffect(() => {
        const handler = (input: Buffer) => {
            if (input.toString() === '\x1B') { // ESC key
                onBack();
            }
        };

        process.stdin.on('data', handler);
        return () => {
            process.stdin.removeListener('data', handler);
        };
    }, [onBack]);

    return (
        <Box flexDirection="column" alignItems="center" padding={1}>
            <Text>
                {`
            ___
          (___)
   ____
 _\\___ \\  |\\_/|
\\     \\ \\/ , , \\ ___
 \\__   \\ \\ ="= //|||\\
  |===  \\/____)_)||||
  \\______|    | |||||
      _/_|  | | =====
     (_/  \\_)_) snd
  _________________
 (                _)
  (__   '          )
    (___    _____)
        '--'
                `}
            </Text>
            <Box marginY={1}>
                <Text>Press <Text color="yellow">ESC</Text> to go back and configure your API key (ascii art by by Shanaka Dias) </Text>
            </Box>
        </Box>
    );
}; 