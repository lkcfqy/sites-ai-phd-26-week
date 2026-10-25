import unittest
from inspect_result import inspect

def fixture():
    # Explicit synthetic fixture, not a GPU execution record.
    return {'completed':15,'failed':1,'duration':10,'input_lens':[128]*16,'output_lens':[4]*15+[0],'ttfts':[.1]*15+[0],'latencies':[.4]*15+[0],'itls':[[.1,.1,.1] for _ in range(15)]+[[]],'errors':['']*15+['SyntheticError'],'total_input_tokens':1920,'total_output_tokens':60,'request_throughput':1.5,'output_throughput':6,'total_token_throughput':198,'mean_ttft_ms':100,'mean_tpot_ms':100}

class DetailedTests(unittest.TestCase):
    def test_recompute(self):
        result=inspect(fixture(),16)
        self.assertEqual(len(result['requests']),16);self.assertEqual(result['metrics']['failed'],1)
        self.assertAlmostEqual(result['metrics']['p95_tpot_ms'],100)
    def test_tamper(self):
        for field in ['completed','total_input_tokens','total_output_tokens','request_throughput','mean_ttft_ms','mean_tpot_ms']:
            data=fixture();data[field]+=1
            with self.assertRaisesRegex(ValueError,field):inspect(data,16)
    def test_full_raw_data_required(self):
        for field in ['input_lens','output_lens','ttfts','latencies','itls','errors']:
            data=fixture();data[field].pop()
            with self.assertRaisesRegex(ValueError,field):inspect(data,16)
        data=fixture();del data['latencies']
        with self.assertRaisesRegex(ValueError,'latencies'):inspect(data,16)
    def test_types_boundaries_and_single_token(self):
        for value in [True,float('nan'),-1]:
            data=fixture();data['ttfts'][0]=value
            with self.assertRaises(ValueError):inspect(data,16)
        data=fixture();data['latencies'][0]=.01
        with self.assertRaises(ValueError):inspect(data,16)
        data=fixture();data['output_lens']=[1]*15+[0];data['total_output_tokens']=15;data['output_throughput']=1.5;data['total_token_throughput']=193.5;data['mean_tpot_ms']=0
        self.assertEqual(inspect(data,16)['metrics']['mean_tpot_ms'],0)
    def test_all_failed_keeps_failures(self):
        data=fixture();data.update(completed=0,failed=16,output_lens=[0]*16,errors=['SyntheticError']*16,total_input_tokens=0,total_output_tokens=0,request_throughput=0,output_throughput=0,total_token_throughput=0,mean_ttft_ms=0,mean_tpot_ms=0)
        self.assertEqual(inspect(data,16)['metrics']['completed'],0)

if __name__=='__main__':unittest.main()
