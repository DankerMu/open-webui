import copy
import json
import os
import subprocess
from pathlib import Path

import pytest

HELPER = Path(__file__).with_name('verify-office-diagnostics.mjs')
PAGE = 'docx-original-open'
FRAME = 'documentserver-editor-frame'
ORIGIN = 'http://127.0.0.1:41001'
SCRIPT = ORIGIN + '/sdkjs/word/sdk-all-min.js'
DOCUMENT = ORIGIN + '/web-apps/apps/documenteditor/main/index.html'
REFUSAL = 'Permissions policy violation: unload is not allowed in this document.'


def _classify(observations):
    code = (
        "import fs from 'node:fs'; import {pathToFileURL} from 'node:url'; "
        'const {classifyOfficeDiagnostics}=await import(pathToFileURL(process.argv[1]).href); '
        "process.stdout.write(JSON.stringify(classifyOfficeDiagnostics(JSON.parse(fs.readFileSync(0,'utf8')))));"
    )
    result = subprocess.run(
        [os.environ.get('OFFICE_NODE', 'node'), '--input-type=module', '-e', code, str(HELPER)],
        input=json.dumps(observations),
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def _evidence():
    return {
        'pageId': PAGE,
        'editorFrameId': FRAME,
        'documentServerOrigin': ORIGIN,
        'consoleErrors': [
            {
                'id': 'native-console-observation',
                'pageId': PAGE,
                'text': REFUSAL,
                'location': {'url': SCRIPT, 'lineNumber': 12, 'columnNumber': 0},
            }
        ],
        'nativeEntries': [
            {
                'pageId': PAGE,
                'frameId': FRAME,
                'entry': {
                    'source': 'violation',
                    'level': 'error',
                    'text': REFUSAL,
                    'timestamp': 1792020335291.465,
                    'url': SCRIPT,
                    'lineNumber': 12,
                    'stackTrace': {
                        'callFrames': [
                            {
                                'functionName': '',
                                'scriptId': 'native-script-1',
                                'url': SCRIPT,
                                'lineNumber': 12,
                                'columnNumber': 98,
                            }
                        ]
                    },
                },
            }
        ],
        'policies': [
            {
                'pageId': PAGE,
                'frameId': FRAME,
                'documentUrl': DOCUMENT,
                'unloadAllowed': False,
            }
        ],
        'pageErrors': [],
    }


def test_verified_native_refusal_is_retained_as_one_expected_diagnostic():
    result = _classify(_evidence())
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert result['expectedPolicyDenials'][0]['nativeEntry']['entry']['source'] == 'violation'
    assert result['expectedPolicyDenials'][0]['policy']['unloadAllowed'] is False
    assert result['unexpectedConsoleErrors'] == []
    assert result['pageErrors'] == []


def test_identical_script_console_error_without_native_provenance_is_unexpected():
    observations = _evidence()
    observations['nativeEntries'] = []
    observations['consoleErrors'][0]['id'] = 'script-console-observation'
    result = _classify(observations)
    assert result['expectedPolicyDenials'] == []
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['script-console-observation']


@pytest.mark.parametrize('duplicate_native_delivery', [False, True])
def test_one_native_denial_cannot_absorb_an_identical_script_error(duplicate_native_delivery):
    observations = _evidence()
    script_error = copy.deepcopy(observations['consoleErrors'][0])
    script_error['id'] = 'script-console-observation'
    script_error['location']['columnNumber'] = 140
    observations['consoleErrors'].append(script_error)
    if duplicate_native_delivery:
        observations['nativeEntries'].append(copy.deepcopy(observations['nativeEntries'][0]))
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['script-console-observation']


@pytest.mark.parametrize(
    ('path', 'value'),
    [
        (('nativeEntries', 0, 'pageId'), 'another-page'),
        (('nativeEntries', 0, 'frameId'), 'another-editor-frame'),
        (('consoleErrors', 0, 'pageId'), 'another-page'),
        (('nativeEntries', 0, 'entry', 'source'), 'javascript'),
        (('nativeEntries', 0, 'entry', 'level'), 'warning'),
        (('nativeEntries', 0, 'entry', 'text'), 'Some other native violation'),
        (('nativeEntries', 0, 'entry', 'timestamp'), None),
        (('nativeEntries', 0, 'entry', 'url'), 'http://127.0.0.1:41002/sdkjs/word/sdk-all-min.js'),
        (('consoleErrors', 0, 'location', 'url'), 'http://127.0.0.1:41002/sdkjs/word/sdk-all-min.js'),
        (('nativeEntries', 0, 'entry', 'lineNumber'), 99),
        (('policies',), []),
        (('policies', 0, 'pageId'), 'another-page'),
        (('policies', 0, 'frameId'), 'another-editor-frame'),
        (('policies', 0, 'documentUrl'), 'http://127.0.0.1:41002/unrelated-editor'),
        (('policies', 0, 'unloadAllowed'), None),
        (('policies', 0, 'unloadAllowed'), True),
    ],
)
def test_unproven_or_wrong_scope_refusal_remains_unexpected(path, value):
    observations = _evidence()
    target = observations
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    result = _classify(observations)
    assert result['expectedPolicyDenials'] == []
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['native-console-observation']


def test_every_page_error_remains_fatal_even_when_its_text_matches_the_refusal():
    observations = _evidence()
    observations['pageErrors'] = [{'id': 'page-error', 'pageId': PAGE, 'message': REFUSAL}]
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert [row['id'] for row in result['pageErrors']] == ['page-error']


def test_console_order_does_not_let_script_text_consume_native_proof():
    observations = _evidence()
    script_error = copy.deepcopy(observations['consoleErrors'][0])
    script_error['id'] = 'script-console-observation'
    script_error['location']['columnNumber'] = 140
    observations['consoleErrors'].insert(0, script_error)
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['script-console-observation']


def test_two_distinct_native_denials_each_consume_exactly_one_console_error():
    observations = _evidence()
    second_console = copy.deepcopy(observations['consoleErrors'][0])
    second_console['id'] = 'second-native-console-observation'
    observations['consoleErrors'].append(second_console)
    second_native = copy.deepcopy(observations['nativeEntries'][0])
    second_native['entry']['timestamp'] += 1
    observations['nativeEntries'].append(second_native)
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == [
        'native-console-observation',
        'second-native-console-observation',
    ]
    assert result['unexpectedConsoleErrors'] == []


@pytest.mark.parametrize(
    'mutation',
    [
        'wrong-console-frame',
        'javascript-source',
        'wrong-console-column',
        'missing-stack',
        'missing-script-id',
        'wrong-script-url',
        'wrong-document',
    ],
)
def test_native_proof_cannot_authorize_unrelated_or_incomplete_observations(mutation):
    observations = _evidence()
    if mutation == 'wrong-console-frame':
        observations['consoleErrors'][0]['frameId'] = 'another-frame'
    elif mutation == 'javascript-source':
        observations['consoleErrors'][0]['source'] = 'javascript'
    elif mutation == 'wrong-console-column':
        observations['consoleErrors'][0]['location']['columnNumber'] = 140
    elif mutation == 'missing-stack':
        observations['nativeEntries'][0]['entry'].pop('stackTrace')
    elif mutation == 'missing-script-id':
        observations['nativeEntries'][0]['entry']['stackTrace']['callFrames'][0].pop('scriptId')
    elif mutation == 'wrong-script-url':
        observations['nativeEntries'][0]['entry']['stackTrace']['callFrames'][0]['url'] = ORIGIN + '/other.js'
    else:
        observations['nativeEntries'][0]['documentId'] = 'current-document-context'
        observations['policies'][0]['documentId'] = 'retired-document-context'
    result = _classify(observations)
    assert result['expectedPolicyDenials'] == []
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['native-console-observation']


def test_identical_location_script_error_is_not_paired_with_native_denial():
    observations = _evidence()
    script_error = copy.deepcopy(observations['consoleErrors'][0])
    script_error.update(id='script-console-observation', source='javascript')
    observations['consoleErrors'].insert(0, script_error)
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['script-console-observation']


def test_denied_policy_is_bound_to_the_same_document_context_as_native_script():
    observations = _evidence()
    observations['nativeEntries'][0]['documentId'] = 'current-document-context'
    observations['policies'][0]['documentId'] = 'current-document-context'
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert result['unexpectedConsoleErrors'] == []


def _child_evidence():
    observations = _evidence()
    root_document = '-2044879055197421172.7604257009893097324'
    child_frame = 'E2824310A06CD32A73AB9EF1CF76F220'
    child_document = '-4094896214807534745.-3018064181504466436'
    plugin_script = ORIGIN + '/sdkjs-plugins/v1/plugins.js'
    observations['editorDocumentId'] = root_document
    observations['policies'][0]['documentId'] = root_document
    observations['consoleErrors'][0].update(
        frameId=child_frame,
        source='native-log',
        location={'url': plugin_script, 'lineNumber': 39, 'columnNumber': 0},
    )
    native = observations['nativeEntries'][0]
    native.update(frameId=child_frame, documentId=child_document)
    native['entry'].update(url=plugin_script, lineNumber=39)
    native['entry']['stackTrace']['callFrames'][0].update(
        scriptId='542',
        url=plugin_script,
        lineNumber=39,
    )
    native['provenance'] = [
        {
            'scriptId': '542',
            'scriptUrl': plugin_script,
            'executionContextId': 9,
            'executionContextUniqueId': child_document,
            'frameId': child_frame,
        }
    ]
    observations['policies'].append(
        {
            'pageId': PAGE,
            'frameId': child_frame,
            'documentId': child_document,
            'documentUrl': ORIGIN + '/sdkjs-plugins/native-plugin/index.html',
            'unloadAllowed': False,
            'ancestry': [
                {'frameId': child_frame, 'parentFrameId': FRAME, 'documentId': child_document},
                {'frameId': FRAME, 'parentFrameId': 'broker-preview-frame', 'documentId': root_document},
            ],
        }
    )
    return observations


@pytest.mark.parametrize('duplicate_delivery', [False, True])
def test_owned_native_child_denial_does_not_hide_script_or_page_errors(duplicate_delivery):
    observations = _child_evidence()
    spoof = copy.deepcopy(observations['consoleErrors'][0])
    spoof.update(id='javascript-spoof', source='javascript')
    observations['consoleErrors'].insert(0, spoof)
    observations['pageErrors'] = [{'id': 'page-error', 'pageId': PAGE, 'message': REFUSAL}]
    if duplicate_delivery:
        observations['nativeEntries'].append(copy.deepcopy(observations['nativeEntries'][0]))
    result = _classify(observations)
    assert [row['consoleError']['id'] for row in result['expectedPolicyDenials']] == ['native-console-observation']
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['javascript-spoof']
    assert [row['id'] for row in result['pageErrors']] == ['page-error']
    assert result['expectedPolicyDenials'][0]['policy']['documentId'] == observations['nativeEntries'][0]['documentId']


@pytest.mark.parametrize(
    ('path', 'value'),
    [
        (('editorDocumentId',), 'reused-editor-frame-new-document'),
        (('nativeEntries', 0, 'documentId'), 'retired-child-document'),
        (('nativeEntries', 0, 'entry', 'source'), 'javascript'),
        (('nativeEntries', 0, 'entry', 'text'), 'unrelated native error'),
        (('policies', 0, 'frameId'), 'foreign-editor-frame'),
        (('policies', 0, 'documentId'), 'stale-root-document'),
        (('policies', 0, 'unloadAllowed'), True),
        (('policies', 1, 'documentId'), 'reused-child-frame-new-document'),
        (('policies', 1, 'unloadAllowed'), None),
        (('policies', 1, 'unloadAllowed'), True),
        (('policies', 1, 'documentUrl'), 'http://127.0.0.1:41002/foreign-child'),
        (('policies', 1, 'ancestry'), []),
        (('policies', 1, 'ancestry'), [{'frameId': 'unrelated-frame', 'documentId': 'foreign-context'}]),
        (('policies', 1, 'ancestry', 0, 'parentFrameId'), 'foreign-parent'),
        (('policies', 1, 'ancestry', 0, 'documentId'), 'stale-child-context'),
        (('policies', 1, 'ancestry', 1, 'frameId'), 'E2824310A06CD32A73AB9EF1CF76F220'),
        (('policies', 1, 'ancestry', 1, 'documentId'), 'stale-root-context'),
        (('policies', 1, 'ancestry', 1, 'documentId'), None),
    ],
)
def test_unproven_child_ownership_never_authorizes_native_refusal(path, value):
    observations = _child_evidence()
    target = observations
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    result = _classify(observations)
    assert result['expectedPolicyDenials'] == []
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['native-console-observation']


@pytest.mark.parametrize('policy_index', [0, 1], ids=['root', 'child'])
def test_conflicting_document_policy_keeps_child_refusal_fatal(policy_index):
    observations = _child_evidence()
    conflict = copy.deepcopy(observations['policies'][policy_index])
    conflict['unloadAllowed'] = True
    observations['policies'].append(conflict)
    result = _classify(observations)
    assert result['expectedPolicyDenials'] == []
    assert [row['id'] for row in result['unexpectedConsoleErrors']] == ['native-console-observation']


def test_collector_retirement_cannot_lend_reused_context_policy_to_old_native_error():
    code = r"""
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const {collectOfficeDiagnostics} = await import(pathToFileURL(process.argv[1]).href);
const origin = 'http://127.0.0.1:41001';
const script = origin + '/sdkjs-plugins/v1/plugins.js';
const refusal = 'Permissions policy violation: unload is not allowed in this document.';
const unhandled = [];
const rejection = (error) => unhandled.push(error.message);
process.on('unhandledRejection', rejection);
const client = new EventEmitter();
const page = new EventEmitter();
const live = new Map();
const documents = new Map();
let rejectOld;
let oldStarted;
const oldPending = new Promise((resolve, reject) => { rejectOld = reject; });
const oldObserved = new Promise((resolve) => { oldStarted = resolve; });
const rootWindow = {};
const root = {
    id: 7, uniqueId: 'root-document', origin,
    auxData: {isDefault: true, frameId: 'editor-root'}
};
function create(context) {
    live.set(context.id, context);
    documents.set(context.uniqueId, {
        context, window: context.uniqueId === 'root-document' ? rootWindow : {}
    });
    client.emit('Runtime.executionContextCreated', {context});
}
client.send = async (method, params = {}) => {
    if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: 'editor-root'}}};
    if (method === 'Runtime.enable') {
        create(root);
        return {};
    }
    if (method !== 'Runtime.evaluate') return {};
    const context = params.uniqueContextId
        ? documents.get(params.uniqueContextId)?.context : live.get(params.contextId);
    if (context?.uniqueId === 'old-child-document') {
        oldStarted();
        return oldPending;
    }
    if (!context || live.get(context.id)?.uniqueId !== context.uniqueId)
        throw new Error('execution context is retired');
    const document = documents.get(context.uniqueId);
    const value = vm.runInNewContext(params.expression, {
        globalThis: document.window,
        location: {href: context.uniqueId === 'root-document'
            ? origin + '/web-apps/apps/documenteditor/main/index.html'
            : origin + '/sdkjs-plugins/native-plugin/index.html'},
        document: {permissionsPolicy: {allowsFeature: () => false}}
    });
    return {result: {value}};
};
page.context = () => ({newCDPSession: async () => client});
page.isClosed = () => false;
page.evaluate = async (operation, key) =>
    vm.runInNewContext(`(${operation.toString()})(key)`, {window: rootWindow, key});
let updates = 0;
const collector = await collectOfficeDiagnostics(page, {
    pageId: 'lifetime-page', documentServerOrigin: origin, onUpdate: () => { updates += 1; }
});
await collector.capturePolicy(page);
client.emit('Page.frameAttached', {frameId: 'plugin-child', parentFrameId: 'editor-root'});
create({
    id: 9, uniqueId: 'old-child-document', origin,
    auxData: {isDefault: true, frameId: 'plugin-child'}
});
await Promise.race([
    oldObserved,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('old policy was not observed')), 2000))
]);
function parsed(scriptId) {
    client.emit('Debugger.scriptParsed', {scriptId, url: script, executionContextId: 9});
}
function denial(scriptId, timestamp, lineNumber) {
    client.emit('Log.entryAdded', {entry: {
        source: 'violation', level: 'error', text: refusal, timestamp,
        url: script, lineNumber,
        stackTrace: {callFrames: [{scriptId, url: script, lineNumber, columnNumber: 0}]}
    }});
    page.emit('console', {
        type: () => 'error', args: () => [], text: () => refusal,
        location: () => ({url: script, lineNumber, columnNumber: 0})
    });
}
parsed('old-script');
denial('old-script', 1, 39);
live.delete(9);
client.emit('Runtime.executionContextDestroyed', {
    executionContextId: 9, executionContextUniqueId: 'old-child-document'
});
parsed('orphan-script');
client.emit('Page.frameDetached', {frameId: 'plugin-child'});
client.emit('Page.frameAttached', {frameId: 'plugin-child', parentFrameId: 'editor-root'});
create({
    id: 9, uniqueId: 'new-child-document', origin,
    auxData: {isDefault: true, frameId: 'plugin-child'}
});
rejectOld(new Error('old unique execution context retired during observation'));
parsed('new-script');
denial('new-script', 2, 40);
denial('orphan-script', 3, 39);
const result = await collector.drain();
const drainedUpdates = updates;
await new Promise((resolve) => setImmediate(resolve));
process.removeListener('unhandledRejection', rejection);
process.stdout.write(JSON.stringify({
    nativeDocuments: result.observations.nativeEntries.map((row) => row.documentId ?? null),
    policyDocuments: result.observations.policies.map((row) => row.documentId),
    expected: result.expectedPolicyDenials.map((row) => row.consoleError.id),
    unexpected: result.unexpectedConsoleErrors.map((row) => row.id),
    unhandled, lateUpdates: updates - drainedUpdates
}));
"""
    result = subprocess.run(
        [os.environ.get('OFFICE_NODE', 'node'), '--input-type=module', '-e', code, str(HELPER)],
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    observed = json.loads(result.stdout)
    assert observed['nativeDocuments'] == ['old-child-document', 'new-child-document', None]
    assert 'old-child-document' not in observed['policyDocuments']
    assert 'new-child-document' in observed['policyDocuments']
    assert observed['expected'] == ['lifetime-page-console-2']
    assert observed['unexpected'] == ['lifetime-page-console-1', 'lifetime-page-console-3']
    assert observed['unhandled'] == []
    assert observed['lateUpdates'] == 0
