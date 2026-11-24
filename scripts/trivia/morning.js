// TRIVIA MORNING: the morning part of the trivia night (scripts/trivia/night.js --morning): the transcript and moment checks,
// the timed questions and the question bank, made after VoidTV Nightly has rebuilt the catalog (Bryan, 24 Nov 2026: "Night job
// order", "By itself each morning"). Its own file because the scheduled task "VoidTV Trivia Morning" (daily 4:30 AM) runs it
// through scripts/run-hidden.vbs, which passes one argument, the script.
'use strict';
if (!process.argv.includes('--morning')) process.argv.push('--morning');
require('./night').main();
