import {PreflightObserver} from './windows-ci-preflight.mjs';
// Never forward test stdout/stderr, error messages, stacks, TAP or arbitrary names.
export default async function* reporter(events){
  const observer=new PreflightObserver(process.env.GMT_PREFLIGHT_STAGE);
  for await(const event of events)observer.event(event);
  yield JSON.stringify(observer.result());
}
