const targets={
  gutenberg:'https://www.gutenberg.org/ebooks/1342.txt.utf-8',
  gutendex:'https://gutendex.com/books/?search=alice&languages=en',
  archive:'https://archive.org/advancedsearch.php?q=collection%3Afeature_films&output=json&rows=1',
};
for(const [name,url] of Object.entries(targets)) {
  try {const response=await fetch(url,{signal:AbortSignal.timeout(20000)});const text=await response.text();console.log(JSON.stringify({name,status:response.status,length:text.length,preview:text.slice(0,100)}));}
  catch(error){console.log(JSON.stringify({name,error:error.message}));}
}
