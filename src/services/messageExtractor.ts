/**
 * Utility to unwrap and extract human-readable text and interactive button/list responses
 * from Baileys WhatsApp messages (including ephemeral, view-once, native flow, and legacy buttons).
 */

export interface ExtractedMessageDetails {
  text: string;
  selectedId?: string;
  selectedDisplayText?: string;
  messageType: string;
}

/**
 * Recursively unwrap future-proof, ephemeral, view-once, and edited message wrappers.
 */
export function unwrapWAMessage(rawMessage: any): any {
  if (!rawMessage) return null;
  let current = rawMessage;

  // If top-level WAMessage object is passed
  if (current.message) {
    current = current.message;
  }

  // Set safe max iteration depth to unwrap nested wrappers
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break;

    const inner =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message?.protocolMessage?.editedMessage ||
      current.editedMessage?.message ||
      current.protocolMessage?.editedMessage ||
      current.associatedChildMessage?.message ||
      current.groupStatusMessage?.message ||
      current.groupStatusMessageV2?.message;

    if (inner) {
      current = inner;
    } else {
      break;
    }
  }

  return current;
}

/**
 * Extract text and interactive reply details from an incoming Baileys message.
 */
export function extractBaileysMessageContent(rawMsgOrMessage: any): ExtractedMessageDetails {
  const msg = unwrapWAMessage(rawMsgOrMessage);
  if (!msg) {
    return { text: '', messageType: 'unknown' };
  }

  // 1. Interactive Response Message (WhatsApp Cloud / Baileys native flow quick replies & buttons)
  if (msg.interactiveResponseMessage) {
    const inter = msg.interactiveResponseMessage;
    let selectedDisplayText = inter.body?.text || '';
    let selectedId = '';

    if (inter.nativeFlowResponseMessage) {
      const nativeFlow = inter.nativeFlowResponseMessage;
      const paramsJson = nativeFlow.paramsJson;
      if (paramsJson) {
        try {
          const parsed = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson;
          if (parsed && typeof parsed === 'object') {
            selectedDisplayText =
              parsed.display_text ||
              parsed.displayText ||
              parsed.text ||
              parsed.title ||
              parsed.label ||
              selectedDisplayText;

            selectedId =
              parsed.id ||
              parsed.selected_id ||
              parsed.selectedId ||
              parsed.selected_row_id ||
              parsed.selectedRowId ||
              '';
          }
        } catch (err) {
          console.warn('[MessageExtractor] Error parsing nativeFlowResponseMessage paramsJson:', err);
        }
      }
    }

    const text = (selectedDisplayText || selectedId || inter.body?.text || '').trim();
    return {
      text,
      selectedId: selectedId ? selectedId.trim() : undefined,
      selectedDisplayText: selectedDisplayText ? selectedDisplayText.trim() : undefined,
      messageType: 'interactive_response',
    };
  }

  // 2. Buttons Response Message (Legacy WhatsApp buttons)
  if (msg.buttonsResponseMessage) {
    const btn = msg.buttonsResponseMessage;
    const selectedDisplayText = (btn.selectedDisplayText || '').trim();
    const selectedId = (btn.selectedButtonId || '').trim();
    const text = selectedDisplayText || selectedId;
    return {
      text,
      selectedId: selectedId || undefined,
      selectedDisplayText: selectedDisplayText || undefined,
      messageType: 'buttons_response',
    };
  }

  // 3. Template Button Reply Message
  if (msg.templateButtonReplyMessage) {
    const tplBtn = msg.templateButtonReplyMessage;
    const selectedDisplayText = (tplBtn.selectedDisplayText || '').trim();
    const selectedId = (tplBtn.selectedId || '').trim();
    const text = selectedDisplayText || selectedId;
    return {
      text,
      selectedId: selectedId || undefined,
      selectedDisplayText: selectedDisplayText || undefined,
      messageType: 'template_button_reply',
    };
  }

  // 4. List Response Message
  if (msg.listResponseMessage) {
    const list = msg.listResponseMessage;
    const selectedDisplayText = (list.title || list.description || '').trim();
    const selectedId = (list.singleSelectReply?.selectedRowId || '').trim();
    const text = selectedDisplayText || selectedId;
    return {
      text,
      selectedId: selectedId || undefined,
      selectedDisplayText: selectedDisplayText || undefined,
      messageType: 'list_response',
    };
  }

  // 5. Standard Text Message
  if (typeof msg.conversation === 'string') {
    return { text: msg.conversation.trim(), messageType: 'text' };
  }
  if (typeof msg.extendedTextMessage?.text === 'string') {
    return { text: msg.extendedTextMessage.text.trim(), messageType: 'text' };
  }

  // 6. Media Messages with Caption
  if (typeof msg.imageMessage?.caption === 'string') {
    return { text: msg.imageMessage.caption.trim(), messageType: 'image' };
  }
  if (typeof msg.videoMessage?.caption === 'string') {
    return { text: msg.videoMessage.caption.trim(), messageType: 'video' };
  }
  if (typeof msg.documentMessage?.caption === 'string') {
    return { text: msg.documentMessage.caption.trim(), messageType: 'document' };
  }

  // 7. Location & Contact
  if (msg.locationMessage) {
    const locText = msg.locationMessage.name || msg.locationMessage.comment || 'Location shared';
    return { text: locText, messageType: 'location' };
  }
  if (msg.contactMessage) {
    return { text: msg.contactMessage.displayName || 'Contact shared', messageType: 'contact' };
  }

  return { text: '', messageType: 'unknown' };
}
