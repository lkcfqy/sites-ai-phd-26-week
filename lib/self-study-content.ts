import type {SelfStudyLesson} from './self-study-types';
import foundations from '@/data/self-study-foundations.json';
import models from '@/data/self-study-models.json';
import vision from '@/data/self-study-vision.json';
import timeseries from '@/data/self-study-timeseries.json';
import language from '@/data/self-study-language.json';
import research from '@/data/self-study-research.json';
export const selfStudyLessons={...foundations,...models,...vision,...timeseries,...language,...research} as unknown as Record<string,SelfStudyLesson>;
export function selfStudyLesson(id:string):SelfStudyLesson|undefined{return Object.hasOwn(selfStudyLessons,id)?selfStudyLessons[id]:undefined}
