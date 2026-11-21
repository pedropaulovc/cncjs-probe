// Stands in for gSender's app/lib/controller: records every command.
const controller = { command: (...args) => globalThis.__gsender.commands.push(args) };
export default controller;
