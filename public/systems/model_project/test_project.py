#!/usr/bin/env python3
import unittest,random,math,argparse
from core import train,quantize,predict,predict_quantized,validate
class CoreTests(unittest.TestCase):
 def test_shapes(self):
  m=train(20)
  for n in [1,3,7,31,64]:
   xs=[[random.Random(i*19+j).uniform(-1,1) for j in range(8)] for i in range(n)]
   self.assertEqual(len(predict(m,xs)),n);self.assertEqual(len(predict_quantized(quantize(m),xs)),n)
 def test_bad_inputs(self):
  for xs in [[],[[0]*7],[[0]*9],[[float('nan')]*8],[[float('inf')]*8],[[True]*8],[[0]*8]*65]:
   with self.assertRaises(ValueError):validate(xs)
 def test_zero_and_error_bound(self):
  m=train(20);q=quantize(m);self.assertEqual(predict_quantized(q,[[0]*8])[0],m['bias'])
  xs=[[.1*i-.4 for i in range(8)]];difference=abs(predict(m,xs)[0]-predict_quantized(q,xs)[0]);self.assertLess(difference,.1)
 def test_train_reproducible(self):self.assertEqual(train(10),train(10))
 def test_learner_optional(self):
  import os
  if os.environ.get('CHECK_LEARNER')!='1':self.skipTest('set CHECK_LEARNER=1 after implementing learner.py')
  import learner
  rng=random.Random(827);m=train(20);q=quantize(m)
  for n in [1,5,13]:
   xs=[[rng.uniform(-.9,.9) for _ in range(8)] for _ in range(n)]
   self.assertEqual(learner.linear_batch(m['weights'],m['bias'],xs),predict(m,xs))
   got=learner.quantized_batch(q['weights'],q['scale'],q['bias'],xs)
   for a,b in zip(got,predict_quantized(q,xs)):self.assertAlmostEqual(a,b,places=9)
   self.assertEqual(len(got),n)
  self.assertEqual(learner.quantized_batch(q['weights'],q['scale'],q['bias'],[[0]*8]),[m['bias']])
  for bad in [[],[[1]*7],[[float('nan')]*8]]:
   with self.assertRaises(ValueError):learner.linear_batch(m['weights'],m['bias'],bad)
if __name__=='__main__':unittest.main()
