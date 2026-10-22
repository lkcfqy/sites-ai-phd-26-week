import type {DepthLesson} from './depth-types';
import foundations from '@/data/depth-foundations.json';
import models from '@/data/depth-models.json';
import vision from '@/data/depth-vision.json';
import timeseries from '@/data/depth-timeseries.json';
import language from '@/data/depth-language.json';
import research from '@/data/depth-research.json';

export const depthLessons={...foundations,...models,...vision,...timeseries,...language,...research} as unknown as Record<string,DepthLesson>;
export function depthLesson(id:string):DepthLesson|undefined{return Object.hasOwn(depthLessons,id)?depthLessons[id]:undefined}
