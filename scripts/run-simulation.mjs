// Local deterministic teaching artifact; no network, GPU, model or wall-clock measurement.
import {readFileSync, writeFileSync} from 'node:fs';
import {loadTS} from './test-ts-loader.mjs';
const {makeSimulationArtifact, simulationModels, simulationDefaults, checkSimulationArtifact} = loadTS('lib/systems-simulation-evidence.ts');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--model', '--parameters', '--output', '--verify'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Use --model NAME --output NEW_FILE [--parameters JSON_FILE], or --verify ARTIFACT');
  options[args[i]] = args[i + 1];
}
function readJSON(path) {const text = readFileSync(path, 'utf8'); if (text.length > 60000) throw new Error('Input exceeds bounded simulation size'); return JSON.parse(text);}
if (options['--verify']) {
  if (Object.keys(options).length !== 1) throw new Error('--verify cannot be combined with generation');
  const artifact = checkSimulationArtifact(readJSON(options['--verify']));
  console.log(JSON.stringify({status: 'simulation-consistency-only', model: artifact.model, provenance: artifact.provenance}));
} else {
  const model = options['--model'];
  if (!simulationModels.includes(model) || !options['--output']) throw new Error('Choose a model and a new output filename');
  const artifact = makeSimulationArtifact(model, options['--parameters'] ? readJSON(options['--parameters']) : simulationDefaults[model]);
  writeFileSync(options['--output'], JSON.stringify(artifact, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: 'simulation-generated-not-measured', model, output: options['--output'], provenance: artifact.provenance}));
}
