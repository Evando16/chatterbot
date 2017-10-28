const neo4j = require('neo4j-driver').v1;
const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic('neo4j', 'tccbotneo4j'));

async function savePrefs(configuration) {
  var session = driver.session();

  const tx = session.beginTransaction();
  try {
    var subjects = '';

    var parametros = { sessionId: configuration.sessionId, name: configuration.name, city: configuration.city }

    configuration.subject.forEach(function (element, index) {
      subjects += (' MERGE (s' + index + ':Subject{name:$subject' + index + '}) ' +
        ' MERGE (p)-[:DESEJA]->(s' + index + ') \n');
      parametros['subject' + index] = element.trim().toLowerCase();
    }, this);

    await executeTransaction(tx,
      ' MATCH (pers1:Person { sessionId:$sessionId})-[des1:DESEJA]->(subj1:Subject ) DELETE des1\n ',
      parametros
    );

    var select = 'MERGE (p:Person{sessionId: $sessionId})\n ' +
      'ON CREATE SET p.name = $name, p.city = $city, p.createDate = timestamp()\n' +
      'ON MATCH SET p.name = $name, p.city = $city, p.updateDate = timestamp()\n';

    if (configuration.newsCity) {
      select += 'MERGE (c:City{name:"City News"}) ' +
        'MERGE (p)-[:DESEJA]->(c)\n';
    } else {
      await executeTransaction(tx,
        'MATCH (pers2:Person { sessionId:$sessionId })-[des2:DESEJA]->(c:City{name:"City News"}) DELETE des2\n',
        parametros
      );
    }

    if (configuration.weatherCity) {
      select += 'MERGE (w:Weather{name:"Weather City"})' +
        'MERGE (p)-[:DESEJA]->(w)\n';
    } else {
      await executeTransaction(tx,
        'MATCH (pers3:Person { sessionId:$sessionId })-[des3:DESEJA]->(w:Weather{name:"Weather City"}) DELETE des3\n',
        parametros
      );
    }

    if (configuration.newsDolar) {
      select += 'MERGE (d:Dollar{name:"Dollar News"}) ' +
        'MERGE (p)-[:DESEJA]->(d)\n';
    } else {
      await executeTransaction(tx,
        'MATCH (pers4:Person { sessionId:$sessionId })-[des4:DESEJA]->(d:Dollar{name:"Dollar News"}) DELETE des4\n',
        parametros
      );
    }

    await executeTransaction(tx,
      select + subjects,
      parametros
    );
    await tx.commit();
    session.close();
  } catch (ex) {
    tx.rollback()
    session.close()
    console.log(ex);
  }
}

async function loadPrefs(sessionId) {
  var session = driver.session();

  const tx = session.beginTransaction();

  try {
    var result = {
      personName: "",
      weatherCity: false,
      cityNews: false,
      cityName: "",
      dollarNews: false,
      subjects: {}
    };

    await executeTransaction(tx,
      'MATCH (p:Person) WHERE p.sessionId = $id RETURN p as person',
      { id: sessionId }
    ).then(person => {
      if (person && person.records && person.records.length > 0) {
        result.personName = person.records[0].get('person').properties.name;
        result.cityName = person.records[0].get('person').properties.city;
      }
    });

    await executeTransaction(tx,
      'MATCH (person { sessionId: $id })-[:DESEJA]->(c:City) RETURN c.name as city',
      { id: sessionId }
    ).then(nodesReturn => {
      if (nodesReturn && nodesReturn.records && nodesReturn.records.length > 0) {
        result.cityNews = nodesReturn.records[0].get('city') === 'City News';
      }
    });

    await executeTransaction(tx,
      'MATCH (person { sessionId: $id })-[:DESEJA]->(d:Dollar) RETURN d.name as dollar',
      { id: sessionId }
    ).then(nodesReturn => {
      if (nodesReturn && nodesReturn.records && nodesReturn.records.length > 0) {
        result.dollarNews = nodesReturn.records[0].get('dollar') === 'Dollar News';
      }
    });


    await executeTransaction(tx,
      'MATCH (person { sessionId: $id })-[:DESEJA]->(w:Weather) RETURN w.name as weather',
      { id: sessionId }
    ).then(nodesReturn => {
      if (nodesReturn && nodesReturn.records && nodesReturn.records.length > 0) {
        result.weatherCity = nodesReturn.records[0].get('weather') === 'Weather City';
      }
    });

    await executeTransaction(tx,
      'MATCH (person { sessionId: $id })-[:DESEJA]->(s:Subject) RETURN s.name as subject',
      { id: sessionId }
    ).then(subjectsReturn => {
      if (subjectsReturn && subjectsReturn.records && subjectsReturn.records.length > 0) {
        result.subjects = subjectsReturn.records.map(
          function (subjects) {
            return subjects.get('subject')
          }
        );
      }
    });

    session.close()
    return result;
  } catch (ex) {
    console.log(ex);
    tx.rollback()
    session.close()
    return "400";
  }
}

function executeTransaction(tx, select, params) {
  return tx.run(
    select,
    params
  )
    .then(result => {
      //console.log(result);
      return result;
    })
    .catch(error => {
      console.log(error);
    })
}

exports.savePrefs = savePrefs;
exports.loadPrefs = loadPrefs;