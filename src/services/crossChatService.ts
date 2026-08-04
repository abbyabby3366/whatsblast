import { CONVERSATION_SCRIPTS } from './crossChatScripts.js';

export interface DialogueTurn {
  speaker: 'A' | 'B';
  text: string;
}

export interface DialogueScript {
  id: string;
  topic: string;
  turns: DialogueTurn[];
}

export function parseSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  return text.replace(spintaxRegex, (_, choices) => {
    const options = choices.split('|');
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex].trim();
  });
}

export { CONVERSATION_SCRIPTS };

export function getRandomScript(): DialogueScript {
  const randomIndex = Math.floor(Math.random() * CONVERSATION_SCRIPTS.length);
  return CONVERSATION_SCRIPTS[randomIndex];
}
