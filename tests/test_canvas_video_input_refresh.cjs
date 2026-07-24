const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const canvasSource = fs.readFileSync(
    path.join(__dirname, '..', 'static', 'js', 'canvas.js'),
    'utf8'
);
const start = canvasSource.indexOf('function refreshGeneratorInputViews(){');
const end = canvasSource.indexOf('\nasync function runGenerator(', start);
assert.ok(start >= 0 && end > start, 'refreshGeneratorInputViews should be present');

const videoSource = {
    id: 'video-source',
    refs: [{url: '/assets/input/reference.mp4', kind: 'video'}]
};
let renderedInputs = null;
const context = {
    nodes: [{id: 'video-target', type: 'video'}],
    CANVAS_GENERATOR_TYPES: ['video'],
    nodesEl: {
        querySelector() {
            return {querySelector() { return {}; }};
        }
    },
    generatorSources() { return []; },
    orderedSources() {
        return [videoSource, {id: 'prompt-source', prompt: 'Follow the reference motion', refs: []}];
    },
    mediaKindForRef(ref) { return ref.kind; },
    imageRefsOnly(refs) { return refs.filter(ref => ref.kind === 'image'); },
    renderPromptPreview() {},
    renderVideoImageInputs(_list, _node, inputs) { renderedInputs = inputs; }
};

vm.runInNewContext(
    `${canvasSource.slice(start, end)}\nrefreshGeneratorInputViews();`,
    context
);

assert.equal(renderedInputs.length, 1);
assert.equal(renderedInputs[0].id, 'video-source');
assert.equal(renderedInputs[0].refs[0].kind, 'video');

renderedInputs = null;
context.orderedSources = () => [
    {id: 'prompt-source', prompt: 'Follow the reference motion', refs: []},
    videoSource
];
context.refreshGeneratorInputViews();
assert.equal(renderedInputs.length, 1);
assert.equal(renderedInputs[0].id, 'video-source');
