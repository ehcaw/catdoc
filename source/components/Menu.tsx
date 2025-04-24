import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export type MenuOption = 'generate' | 'chat' | 'config' | 'tutorial';

interface MenuProps {
	onSelect: (option: MenuOption) => void;
}

// Using cat frames from LoadingCat component
const CAT_FRAME = `
    /\\___/\\
   (  o o  )
   (  =^=  ) ~
    (______)`;

// Space background sections for each option area
const SPACE_BACKGROUNDS = {
	generate: `
   *  . *    *   .    .    .   *   *   .   *
  .  *    .  ___ . * .   .   .   .   *   .
   .   *  .-~   ~-.  .   *   .   .    .   .
  * . .  /         \\   .   .   *  .   .   .
 .  .   |_____     |  .   *  .   .   *   .
   *    |     \\    |.  .   .   .    .   .
 .   .  |      \\   |   .   .   *  .   *  .
   .  * |       \\  | .   .   .    .   .  .`,
	chat: `
                          .  *  .  *  .   *
                       *   .     .    .
                         .    *    .   *  .
                           *   .   *    .
                     *  .    .     .      *
                        .   *    .    *
                     *    .    .   .    .
                        *    .   *   .   `,
	config: `
   *  . *    *   .    .    .   *   *   .   *
  .  *    .   .  . * .   .   .   .   *   .
   .   *    .-.    .   *   .   .    .   .  .
  * . .    / /   .   .   .   *  .   .   .  .
 .  .     / |   .   *  .   .   .   *   .  .
   *    .-""  \`.   .   .   .    .   .   .  .
 .   . 7        ;  .   .   *  .   *   .   .
   .  |    \\_,|   .   .   .    .   .   .  .`,
	tutorial: `
   *  . *    *   .    .    .   *   *   .   *
  .  *    .   .  . * .   .   .   .   *   .
   *  . *    *   .    .    .   *   *   .   *
  * . .  /  o   o  \\ .   .   *  .   .   .  .
 .  .  ( ==  ^  == ) *  .   .   .   *   .  .
   *     )         (   .   .   .    .   .  .
 .   .  (         )  .   .   *  .   *   .  .
   .   (_(__)___(__)_).   .   .    .   .  .`,
};

// Different cat poses for each option
const OPTION_CATS = {
	generate: `
       _          ___
    /' '\\       / " \\
   |  ,--+-----4 /   |
   ',/   o  o     --.;
--._|_   ,--.  _.,-- \\----.
------'--\`--' '-----,' VJ  |
     \\_  .\\_\_.   _,-'---._.'
       \`--...--\`\`  /
         /###\\   | |
         |.   \`.-'-'.
        .||  /,     |
       do_o00oo_,.ob`,
	chat: `
                          ,_     _
                          |\\_,-~/
                          / _  _ |    ,--.
                         (  @  @ )   / ,-'
                          \\  _T_/-._( (
                          /         \`. \\
                         |         _  \\ |
                          \\ \\ ,  /      |
                           || |-_\\__   /
                          ((_/\`(____,-'
                                        `,

	config: `
                       .-.
                      / /
                     / |
                   |\\     ._ ,-""  \`.
                   | |,,_/  7        ;
                 \`;=     ,=(     ,  /
                  |\`q  q  \` |    \\_,|
                 .=; <> _ ; /  ,/'/ |
                ';|\\,j_ \\;=\\ ,/   \`-'`,
	tutorial: `
                         /\\_____/\\
                       /  o   o  \\
                      ( ==  ^  == )
                       )         (
                      (           )
                     ( (  )   (  ) )
                    (__(__)___(__)__)
                                        `,
};

export const Menu: React.FC<MenuProps> = ({onSelect}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const options: {label: string; value: MenuOption}[] = [
		{label: '𝔾𝕖𝕟𝕖𝕣𝕒𝕥𝕖 𝔻𝕠𝕔𝕦𝕞𝕖𝕟𝕥𝕒𝕥𝕚𝕠𝕟', value: 'generate'},
		{label: 'ℂ𝕙𝕒𝕥 𝕨𝕚𝕥𝕙 ℂ𝕠𝕕𝕖𝕓𝕒𝕤𝕖', value: 'chat'},
		{label: 'ℂ𝕠𝕟𝕗𝕚𝕘𝕦𝕣𝕒𝕥𝕚𝕠𝕟', value: 'config'},
		{label: '𝕋𝕦𝕥𝕠𝕣𝕚𝕒𝕝', value: 'tutorial'},
	];

	useInput((_, key) => {
		if (key.upArrow) {
			setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
		} else if (key.downArrow) {
			setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
		} else if (key.leftArrow) {
			setSelectedIndex(prev => (prev % 2 === 1 ? prev - 1 : prev));
		} else if (key.rightArrow) {
			setSelectedIndex(prev =>
				prev % 2 === 0 && prev < options.length - 1 ? prev + 1 : prev,
			);
		} else if (key.return) {
			const option = options[selectedIndex];
			if (option) {
				onSelect(option.value);
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box flexDirection="column" marginBottom={1} alignItems="center">
				<Text color="white">{CAT_FRAME}</Text>
				<Text bold color="white">
					Catdoc: Your Dynamically Generated Documentation for Humans and LLMs
					alike :3
				</Text>
				<Text color="white">Choose an option:</Text>
			</Box>

			{/* First Row */}
			<Box justifyContent="center">
				{options.slice(0, 2).map((option, index) => (
					<Box key={option.value} width={45} marginX={1} flexDirection="column">
						<Box>
							<Text
								color={index === selectedIndex ? 'white' : 'gray'}
								dimColor={index !== selectedIndex}
							>
								{SPACE_BACKGROUNDS[option.value]}
							</Text>
						</Box>
						<Box marginTop={-6} alignItems="center">
							<Text color={index === selectedIndex ? 'green' : 'gray'}>
								{OPTION_CATS[option.value]}
							</Text>
						</Box>
						<Box alignItems="center">
							<Text
								color={index === selectedIndex ? 'green' : 'white'}
								bold={index === selectedIndex}
							>
								{index === selectedIndex ? '› ' : '  '}
								{option.label}
							</Text>
						</Box>
					</Box>
				))}
			</Box>

			{/* Second Row */}
			<Box justifyContent="center">
				{options.slice(2).map((option, index) => (
					<Box key={option.value} width={45} marginX={1} flexDirection="column">
						<Box>
							<Text
								color={index + 2 === selectedIndex ? 'white' : 'gray'}
								dimColor={index + 2 !== selectedIndex}
							>
								{SPACE_BACKGROUNDS[option.value]}
							</Text>
						</Box>
						<Box marginTop={-6} alignItems="center">
							<Text color={index + 2 === selectedIndex ? 'green' : 'gray'}>
								{OPTION_CATS[option.value]}
							</Text>
						</Box>
						<Box alignItems="center">
							<Text
								color={index + 2 === selectedIndex ? 'green' : 'white'}
								bold={index + 2 === selectedIndex}
							>
								{index + 2 === selectedIndex ? '› ' : '  '}
								{option.label}
							</Text>
						</Box>
					</Box>
				))}
			</Box>

			<Box marginTop={1} alignItems="center">
				<Text color="white">Use arrow keys to navigate, Enter to select</Text>
			</Box>
		</Box>
	);
};
