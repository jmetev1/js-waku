import { Box, Grid, List, ListItem, ListItemText } from '@material-ui/core';
import React, { useState } from 'react';
import { ChatMessage } from 'waku-chat/chat_message';
import { WakuMessage } from 'waku/waku_message';
import { ChatContentTopic } from './App';
import MessageInput from './MessageInput';
import { useWaku } from './WakuContext';

interface Props {
  lines: ChatMessage[];
  commandHandler: (cmd: string) => void;
  nick: string;
}

export default function Room(props: Props) {
  let [messageToSend, setMessageToSend] = useState<string>('');
  const { waku } = useWaku();

  const messageHandler = (msg: string) => {
    setMessageToSend(msg);
  };

  const sendMessage = async () => {
    if (messageToSend.startsWith('/')) {
      props.commandHandler(messageToSend);
    } else {
      const chatMessage = new ChatMessage(
        new Date(),
        props.nick,
        messageToSend
      );
      const wakuMsg = WakuMessage.fromBytes(
        chatMessage.encode(),
        ChatContentTopic
      );
      await waku!.relay.send(wakuMsg);
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Box
          height={800}
          maxHeight={800}
          style={{ flex: 1, maxHeight: '100%', overflow: 'scroll' }}
        >
          <Lines messages={props.lines} />
        </Box>
      </Grid>

      <Grid item xs={12}>
        <MessageInput
          messageHandler={messageHandler}
          sendMessage={sendMessage}
        />
      </Grid>
    </Grid>
  );
}

interface LinesProps {
  messages: ChatMessage[];
}

const Lines = (props: LinesProps) => {
  const renderedLines = [];

  for (const i in props.messages) {
    renderedLines.push(
      <ListItem>
        <ListItemText
          key={'chat-message-' + i}
          primary={printMessage(props.messages[i])}
        />
      </ListItem>
    );
  }

  return <List dense={true}>{renderedLines}</List>;
};

// TODO: Make it a proper component
function printMessage(chatMsg: ChatMessage) {
  const timestamp = chatMsg.timestamp.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  return `<${timestamp}> ${chatMsg.nick}: ${chatMsg.message}`;
}
