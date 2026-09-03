import { SIM_VERSION } from '../sim/version.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
root.textContent = `Canyon Run — sim ${SIM_VERSION}`;
