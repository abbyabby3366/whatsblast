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

export const CONVERSATION_SCRIPTS: DialogueScript[] = [
  {
    id: 'script_order_inquiry',
    topic: 'Order Inquiry & Status',
    turns: [
      { speaker: 'A', text: '{Hi|Hello|Good day}, {checking on my recent order|is my order ready for dispatch}?' },
      { speaker: 'B', text: '{Hi there|Hello|Sure}, {let me check the system for you|could you provide your order reference}?' },
      { speaker: 'A', text: '{Order number is #4028|Ref #4028|It is order 4028}. {Thanks|Thank you}!' },
      { speaker: 'B', text: '{Yes, it has been packed and scheduled for delivery today|Found it! It is out for delivery with the courier|All set, it will arrive shortly}.' },
      { speaker: 'A', text: '{Awesome|Great news|Perfect}, {thank you for the update|much appreciated}!' },
    ],
  },
  {
    id: 'script_product_stock',
    topic: 'Product Availability',
    turns: [
      { speaker: 'A', text: '{Hi|Hey|Hello}, {do you still have stock for this item|is this product available}?' },
      { speaker: 'B', text: '{Hello! Yes we have available units|Hi, yes it is in stock}. {Which color or size do you prefer|How many units do you need}?' },
      { speaker: 'A', text: '{I am looking for 2 units in black|Looking for the standard size}.' },
      { speaker: 'B', text: '{Got it, we have that ready in our inventory|No problem, we can reserve those for you}.' },
      { speaker: 'A', text: '{Excellent|Super|Sounds good}, {I will place the order now|thanks for confirming}!' },
    ],
  },
  {
    id: 'script_casual_work',
    topic: 'Casual Work Check-in',
    turns: [
      { speaker: 'A', text: '{Hey|Hi}, {did you manage to review the document|got a minute to check the latest update}?' },
      { speaker: 'B', text: '{Yes! I just reviewed it|Hi, yes everything looks solid}. {Looks good to go|No issues found on my end}.' },
      { speaker: 'A', text: '{Great|Nice}, {let me know if we need to adjust anything|appreciate your quick feedback}!' },
      { speaker: 'B', text: '{Will do! Have a great afternoon|Will keep you posted}.' },
    ],
  },
  {
    id: 'script_support_hours',
    topic: 'Support & Operating Hours',
    turns: [
      { speaker: 'A', text: '{Good morning|Good afternoon}, {what are your operating hours today|are you open for support}?' },
      { speaker: 'B', text: '{Hi|Hello}! {We are open Monday through Friday from 9am to 6pm|Our team is online until 6pm today}.' },
      { speaker: 'A', text: '{Understood|Got it}. {Can I drop by later this afternoon|Is online support active right now}?' },
      { speaker: 'B', text: '{Yes absolutely|Sure thing}! {Feel free to message us anytime|We will be here to help}.' },
      { speaker: 'A', text: '{Thank you very much|Thanks, talk soon}!' },
    ],
  },
  {
    id: 'script_appointment_confirm',
    topic: 'Appointment Confirmation',
    turns: [
      { speaker: 'A', text: '{Hi there|Hello}, {just confirming our schedule for tomorrow|confirming our appointment at 2 PM}?' },
      { speaker: 'B', text: '{Hi! Yes, 2 PM works perfectly for me|Confirmed! See you tomorrow at 2 PM}.' },
      { speaker: 'A', text: '{Perfect|Great}, {see you then|looking forward to it}!' },
      { speaker: 'B', text: '{Have a great evening ahead|See you tomorrow!} 👋' },
    ],
  },
];

export function getRandomScript(): DialogueScript {
  const randomIndex = Math.floor(Math.random() * CONVERSATION_SCRIPTS.length);
  return CONVERSATION_SCRIPTS[randomIndex];
}
