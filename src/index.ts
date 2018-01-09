import * as _ from 'lodash';
import * as transit from 'transit-js';
import * as fs from 'fs';
import axios from 'axios';

const transitReader = transit.reader('json');
const transitWriter = transit.writer('json');

let cookie;

const CIRCLE_QUERY_API = 'https://circleci.com/query-api';
const REQUEST_HEADERS = {
  Host: 'circleci.com',
  Accept: 'application/transit+json',
  Origin: 'https://circleci.com',
  'Content-Type': 'application/transit+json; charset=UTF-8',
  Cookie: cookie,
};

export enum WorkflowStatus {
  SUCCESS = 'success',
  CANCELED = 'canceled',
  BLOCKED = 'blocked',
  RUNNING = 'running',
  FAILED = 'failed',
}

export interface WorkflowInfo {
  id: string;
  status: WorkflowStatus;
  commitSha: string;
  branchName: string;
  workflowName: string;
  createdAt: Date;
}

// Assuming this is running on CircleCI, grab a few values that CCI sets for us automatically
// Ref: https://circleci.com/docs/2.0/env-vars/#build-details
const { CIRCLE_BRANCH, CIRCLE_PROJECT_USERNAME, CIRCLE_PROJECT_REPONAME } = process.env;

export async function getRawWorkflows() {
  const data = await axios
    .get(CIRCLE_QUERY_API, {
      data: [
        '^ ',
        '~:type',
        '~:get-project-workflows',
        '~:params',
        [
          '^ ',
          '~:organization/vcs-type',
          '~:github',
          '~:organization/name',
          CIRCLE_PROJECT_USERNAME,
          '~:project/name',
          CIRCLE_PROJECT_REPONAME,
          '~:opts',
          ['^ ', '~:offset', 0, '~:limit', 30],
        ],
      ],
      headers: REQUEST_HEADERS,
    })
    .then(res => _.get(res, 'data'));
  const transitParsed = transitReader.read(JSON.stringify(data));
  return extractFromTransitMapByName(transitParsed, 'results');
}

function convertRawWorkflows(rawWorkflows): WorkflowInfo[] {
  return _.map(rawWorkflows, getInfoForWorkflow);
}

function getInfoForWorkflow(workflow): WorkflowInfo {
  const createdAt = extractFromTransitMapByName(workflow, 'workflow/created-at') as Date;
  const status = extractFromTransitMapByName(workflow, 'workflow/status') as WorkflowStatus;
  const workflowName = extractFromTransitMapByName(workflow, 'workflow/name') as string;
  const id = _.invoke(extractFromTransitMapByName(workflow, 'workflow/id'), 'toString') as string;

  const triggerInfo = extractFromTransitMapByName(workflow, 'workflow/trigger-info');
  const commitSha = extractFromTransitMapByName(triggerInfo, 'trigger-info/vcs-revision') as string;
  const branchName = extractFromTransitMapByName(triggerInfo, 'trigger-info/branch') as string;
  return { id, createdAt, status, commitSha, workflowName, branchName };
}

export function extractFromTransitMapByName(transitMap, _name) {
  const key = _.find(transitMap.keySet(), { _name });
  return transitMap.get(key);
}

export async function cancelBuild({ id, workflowName }: WorkflowInfo) {
  const cancelQuery = transitReader.read('["~#list",["~$run/cancel",["^ ","~:run/id","","~:run/name",""]]]');
  const transitMap = _.get(cancelQuery, 'rep.1');
  const [idKey, nameKey] = transitMap.keySet();

  transitMap.set(idKey, transit.UUIDfromString(id));
  transitMap.set(nameKey, workflowName);

  await axios.get(CIRCLE_QUERY_API, {
    data: JSON.parse(transitWriter.write(cancelQuery)),
    headers: REQUEST_HEADERS,
  });
}

export default async function(userCookie) {
  if (!userCookie) throw new Error(`You must pass in a valid cookie`);
  cookie = userCookie;
  const workflows = await getRawWorkflows().then(convertRawWorkflows);
  const [thisBuild, ...oldBuilds] = _.filter(workflows, { branchName: CIRCLE_BRANCH });
  const buildsToCancel = _.filter(oldBuilds, build =>
    _.includes([WorkflowStatus.RUNNING, WorkflowStatus.BLOCKED], build.status),
  );
  return await Promise.all(_.map(buildsToCancel, cancelBuild));
}
