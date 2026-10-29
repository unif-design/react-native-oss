from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[3]
source=(root/'node_modules/react-native-blob-util/ios/ReactNativeBlobUtilReqBuilder.mm').read_text()
start=source.index('+(void) buildFormBody:')
end=source.index('\n+(NSString *) getHeaderIgnoreCases:',start)
method=source[start:end]
head='''#import <Foundation/Foundation.h>
#define RCTLogWarn(...) ((void)0)
static NSString *FILE_PREFIX = @"ReactNativeBlobUtil-file://";
@interface ReactNativeBlobUtilFS : NSObject
+(NSString*)getPathOfAsset:(NSString*)path;
+(void)readFile:(NSString*)path encoding:(NSString*)encoding transformFile:(BOOL)flag onComplete:(void(^)(NSData*,NSString*,NSString*))callback;
@end
@implementation ReactNativeBlobUtilFS
+(NSString*)getPathOfAsset:(NSString*)path { return path; }
+(void)readFile:(NSString*)path encoding:(NSString*)encoding transformFile:(BOOL)flag onComplete:(void(^)(NSData*,NSString*,NSString*))callback {
  if ([path isEqualToString:@"broken"]) callback(nil,nil,nil);
  else if ([path isEqualToString:@"error"]) callback(nil,@"fixture",@"read failed");
  else if ([path isEqualToString:@"empty"]) callback([NSData data],nil,nil);
  else callback([@"payload" dataUsingEncoding:NSUTF8StringEncoding],nil,nil);
}
@end
@interface FormBuilder : NSObject
+(void)buildFormBody:(NSArray*)form boundary:(NSString*)boundary onComplete:(void(^)(NSData*,BOOL))onComplete;
@end
@implementation FormBuilder
'''
tail='''@end
int main() {
  @autoreleasepool {
    for (NSString *name in @[@"broken",@"error",@"empty",@"normal"]) {
      __block int completions = 0;
      __block BOOL failed = NO;
      __block NSData *result;
      NSArray *form = @[@{@"name":@"file",@"filename":@"file",@"data":[FILE_PREFIX stringByAppendingString:name]}];
      [FormBuilder buildFormBody:form boundary:@"fixture" onComplete:^(NSData*data,BOOL hasError) { completions++; failed=hasError; result=data; }];
      BOOL expected = [name isEqualToString:@"broken"] || [name isEqualToString:@"error"];
      if (completions != 1 || failed != expected) {
        fprintf(stderr,"incorrect multipart result for %s: callbacks=%d failed=%d expected=%d\\n",name.UTF8String,completions,failed,expected);
        return 1;
      }
      if (!expected && result.length == 0) return 2;
    }
    puts("4 actual iOS multipart builder cases passed");
  }
  return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='portal-oss-native-form-') as folder:
 p=Path(folder)
 (p/'Form.mm').write_text(head+method+tail)
 subprocess.run(['clang++','-fobjc-arc','-fblocks','-framework','Foundation',str(p/'Form.mm'),'-o',str(p/'form')],check=True)
 subprocess.run([str(p/'form')],check=True)
