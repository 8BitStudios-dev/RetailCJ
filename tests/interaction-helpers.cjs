'use strict';

// Completion-oriented legacy scenarios explicitly play the production choices.
// Keeping this inside their loops leaves tests of waiting, timers and pause free
// to assert that an unanswered question remains unanswered.
const guidedChoiceSource = `{
  const question = playerMode && playerMode.player() && playerMode.player().state === 'interaction'
    ? playerMode.view().interaction : null;
  if (question && question.options && question.options.length) {
    const option = question.options.find(item => item.recommended) ||
      question.options.find(item => /-(welcome|discover|relevant|respond|complete)$/.test(item.id)) || question.options[0];
    playerMode.chooseInteraction(option.id, question.token);
  }
}`;

function chooseGuided(env) {
  const question = env.view().interaction;
  if (!question || !question.options || !question.options.length) return false;
  const option = question.options.find(item => item.recommended) ||
      question.options.find(item => /-(welcome|discover|relevant|respond|complete)$/.test(item.id)) || question.options[0];
  return env.mode().chooseInteraction(option.id, question.token);
}

module.exports = {guidedChoiceSource, chooseGuided};
